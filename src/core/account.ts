import {
  Keypair,
  Horizon,
  Networks,
  NotFoundError,
  StrKey,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Transaction,
} from 'stellar-sdk';
import { AccountInfo, Balance, ErrorCode, MultiSigConfig } from '../types';
import { Server } from '../utils/network';
import {
  AccountNotFoundError,
  NetworkConnectionError,
  NetworkTimeoutError,
  ToolkitError,
  ValidationError,
} from '../errors';

export type AccountResponse = Horizon.AccountResponse;

export const MAX_STELLAR_SIGNERS = 20;
export const MIN_SIGNING_THRESHOLD = 1;
export const MAX_SIGNING_THRESHOLD = 255;
export const MIN_SIGNER_WEIGHT = 1;
export const MAX_SIGNER_WEIGHT = 255;

export class AccountManager {
  constructor(
    private server: Server,
    private networkPassphrase: string = Networks.TESTNET,
  ) {}

  private mapAccountLookupError(publicKey: string, error: unknown): Error {
    if (error instanceof AccountNotFoundError) {
      return error;
    }

    const errObj = error as {
      name?: string;
      code?: string;
      message?: string;
      status?: number;
      statusCode?: number;
      response?: { status?: number; statusCode?: number; statusText?: string };
    };

    const status =
      errObj?.response?.status ??
      errObj?.response?.statusCode ??
      errObj?.status ??
      errObj?.statusCode;
    const code = errObj?.code ?? '';
    const name = errObj?.name ?? '';
    const rawMessage =
      error instanceof Error
        ? error.message
        : typeof errObj?.message === 'string'
          ? errObj.message
          : String(error);

    if (
      status === 404 ||
      error instanceof NotFoundError ||
      (status === undefined && /^404 Not Found$/i.test(rawMessage))
    ) {
      return new AccountNotFoundError(publicKey);
    }

    if (error instanceof ToolkitError) {
      return error;
    }

    const serverUrl =
      (
        this.server as unknown as {
          serverURL?: { toString(): string };
        }
      )?.serverURL?.toString?.() || 'horizon';

    if (
      status === 408 ||
      status === 504 ||
      (typeof status !== 'number' &&
        (code === 'ETIMEDOUT' ||
          code === 'ECONNABORTED' ||
          name === 'TimeoutError' ||
          /timed?\s*out/i.test(rawMessage)))
    ) {
      return new NetworkTimeoutError(serverUrl);
    }

    const detail = status === undefined ? rawMessage : `HTTP ${status}: ${rawMessage}`;
    if (status !== undefined && status >= 400 && status < 500) {
      return new Error(`Failed to load account ${publicKey}: ${detail}`);
    }
    return new NetworkConnectionError(serverUrl, detail);
  }

  /**
   * Generate a new Stellar keypair
   */
  generateKeypair(): AccountInfo {
    const pair = Keypair.random();
    return {
      publicKey: pair.publicKey(),
      secret: pair.secret(),
    };
  }

  /**
   * Load account from the network
   */
  async loadAccount(publicKey: string): Promise<AccountResponse> {
    try {
      return await this.server.loadAccount(publicKey);
    } catch (error: unknown) {
      throw this.mapAccountLookupError(publicKey, error);
    }
  }

  /**
   * Get account balances
   */
  async getBalances(publicKey: string): Promise<Balance[]> {
    const account = await this.loadAccount(publicKey);
    return account.balances as Balance[];
  }

  /**
   * Return false only when Horizon confirms the account is missing.
   * Timeouts and other lookup errors are propagated to callers.
   */
  async accountExists(publicKey: string): Promise<boolean> {
    try {
      await this.loadAccount(publicKey);
      return true;
    } catch (error: unknown) {
      if (error instanceof AccountNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get account native balance
   */
  async getNativeBalance(publicKey: string): Promise<string> {
    const balances = await this.getBalances(publicKey);
    const nativeBalance = balances.find((b) => b.asset_type === 'native');
    return nativeBalance?.balance || '0';
  }

  /**
   * Fund account on testnet using Friendbot
   */
  async fundTestnetAccount(publicKey: string): Promise<void> {
    if (this.networkPassphrase !== Networks.TESTNET) {
      throw new ValidationError('network', 'Friendbot funding requires a testnet client');
    }
    if (!StrKey.isValidEd25519PublicKey(publicKey)) {
      throw new ValidationError('publicKey', 'Friendbot requires a Stellar account public key');
    }

    let response: Response;
    try {
      response = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
    } catch {
      throw new NetworkConnectionError('Friendbot');
    }
    if (!response.ok) {
      throw new NetworkConnectionError('Friendbot', `HTTP ${response.status}`);
    }
  }

  /**
   * Validate a multi-signature configuration
   */
  validateMultiSigConfig(config: MultiSigConfig): void {
    if (!config.signers || config.signers.length === 0) {
      throw new ValidationError('signers', 'At least one signer is required');
    }
    if (config.signers.length > MAX_STELLAR_SIGNERS) {
      throw new ValidationError(
        'signers',
        `Cannot exceed ${MAX_STELLAR_SIGNERS} signers per account`,
      );
    }

    const masterWeight = config.masterWeight ?? 1;
    if (!Number.isInteger(masterWeight) || masterWeight < 0 || masterWeight > 255) {
      throw new ValidationError('masterWeight', 'Weight out of range (must be 0-255)');
    }

    let totalWeight = masterWeight;
    for (const signer of config.signers) {
      if (!Number.isInteger(signer.weight) || signer.weight < 0 || signer.weight > 255) {
        throw new ValidationError('weight', 'Weight out of range (must be 0-255)');
      }
      totalWeight += signer.weight;
    }

    const { low, medium, high } = config.thresholds;
    for (const [name, value] of Object.entries({ low, medium, high })) {
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new ValidationError(name, 'Threshold out of range (must be 0-255)');
      }
    }

    const maxThreshold = Math.max(low, medium, high);
    if (maxThreshold > totalWeight) {
      throw new ValidationError(
        'thresholds',
        `Threshold too high: max threshold (${maxThreshold}) exceeds total available signer weight (${totalWeight})`,
      );
    }
  }

  /**
   * Configure a multi-signature account with signers and thresholds
   */
  async configureMultiSig(config: MultiSigConfig): Promise<string> {
    this.validateMultiSigConfig(config);

    const masterKeypair = Keypair.fromSecret(config.masterSecret);
    const sourceAccount = await this.server.loadAccount(masterKeypair.publicKey());

    const builder = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    });

    for (const signer of config.signers) {
      builder.addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: signer.publicKey,
            weight: signer.weight,
          },
        }),
      );
    }

    builder.addOperation(
      Operation.setOptions({
        masterWeight: config.masterWeight ?? 1,
        lowThreshold: config.thresholds.low,
        medThreshold: config.thresholds.medium,
        highThreshold: config.thresholds.high,
      }),
    );

    const tx = builder.setTimeout(180).build();
    tx.sign(masterKeypair);

    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Add or update a signer on an account
   */
  async addSigner(masterSecret: string, signerPublicKey: string, weight: number): Promise<string> {
    if (!Number.isInteger(weight) || weight <= 0 || weight > 255) {
      throw new ValidationError('weight', 'Weight out of range (must be 1-255)');
    }

    const masterKeypair = Keypair.fromSecret(masterSecret);
    const sourceAccount = await this.server.loadAccount(masterKeypair.publicKey());

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: signerPublicKey,
            weight,
          },
        }),
      )
      .setTimeout(180)
      .build();

    tx.sign(masterKeypair);
    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Remove a signer from an account (sets weight to 0)
   */
  async removeSigner(masterSecret: string, signerPublicKey: string): Promise<string> {
    const masterKeypair = Keypair.fromSecret(masterSecret);
    const sourceAccount = await this.server.loadAccount(masterKeypair.publicKey());

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: signerPublicKey,
            weight: 0,
          },
        }),
      )
      .setTimeout(180)
      .build();

    tx.sign(masterKeypair);
    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Sign a transaction with multiple signers and verify threshold satisfaction.
   *
   * Validation & missing-weight policy:
   * - `requiredThreshold` must be a finite integer in `1..255`.
   * - When `signerWeights` is omitted, each unique signer contributes weight `1`.
   * - When `signerWeights` is provided, every entry must be a finite integer in `1..255`,
   *   and every participating signer must have an explicit own property in `signerWeights`
   *   (missing signer weights throw `ValidationError` rather than defaulting to `1`).
   * - Duplicate secrets resolving to the same public key are counted and applied once.
   * - `transaction` is never mutated unless all validations and threshold checks succeed.
   */
  signMultiSigTransaction(
    transaction: Transaction,
    signerSecrets: string[],
    requiredThreshold = 1,
    signerWeights?: Record<string, number>,
  ): Transaction {
    if (!transaction || typeof transaction.sign !== 'function') {
      throw new ValidationError('transaction', 'A valid Stellar Transaction instance is required');
    }

    if (
      !Number.isInteger(requiredThreshold) ||
      requiredThreshold < MIN_SIGNING_THRESHOLD ||
      requiredThreshold > MAX_SIGNING_THRESHOLD
    ) {
      throw new ToolkitError(
        `Invalid requiredThreshold (${String(requiredThreshold)}): threshold out of range (must be an integer between ${MIN_SIGNING_THRESHOLD} and ${MAX_SIGNING_THRESHOLD}).`,
        {
          code: ErrorCode.INVALID_THRESHOLD,
          category: 'validation',
          recoverySuggestion: `Provide an integer requiredThreshold between ${MIN_SIGNING_THRESHOLD} and ${MAX_SIGNING_THRESHOLD} matching the Stellar operation threshold.`,
          retryable: false,
          details: { requiredThreshold },
        },
      );
    }

    if (!Array.isArray(signerSecrets) || signerSecrets.length === 0) {
      throw new ValidationError('signerSecrets', 'At least one signer secret is required');
    }

    if (signerWeights !== undefined) {
      if (
        typeof signerWeights !== 'object' ||
        signerWeights === null ||
        Array.isArray(signerWeights)
      ) {
        throw new ValidationError(
          'signerWeights',
          'Signer weights must be a plain object mapping Stellar public keys to integer weights',
        );
      }

      for (const [publicKey, weight] of Object.entries(signerWeights)) {
        if (!Number.isInteger(weight) || weight < MIN_SIGNER_WEIGHT || weight > MAX_SIGNER_WEIGHT) {
          throw new ValidationError(
            'signerWeights',
            `Weight for signer ${publicKey} out of range (must be an integer between ${MIN_SIGNER_WEIGHT} and ${MAX_SIGNER_WEIGHT})`,
          );
        }
      }
    }

    const seenPublicKeys = new Set<string>();
    const uniqueKeypairs: Keypair[] = [];

    for (const rawSecret of signerSecrets) {
      if (typeof rawSecret !== 'string' || rawSecret.trim().length === 0) {
        throw new ValidationError('signerSecrets', 'Each signer secret must be a non-empty string');
      }

      let kp: Keypair;
      try {
        kp = Keypair.fromSecret(rawSecret.trim());
      } catch {
        throw new ValidationError('signerSecrets', 'Invalid Stellar secret key');
      }

      const publicKey = kp.publicKey();
      if (!seenPublicKeys.has(publicKey)) {
        seenPublicKeys.add(publicKey);
        uniqueKeypairs.push(kp);
      }
    }

    let accumulatedWeight = 0;
    for (const kp of uniqueKeypairs) {
      const publicKey = kp.publicKey();
      if (signerWeights !== undefined) {
        if (!Object.prototype.hasOwnProperty.call(signerWeights, publicKey)) {
          throw new ValidationError(
            'signerWeights',
            `Missing signer weight for public key ${publicKey}; all participating signers must be explicitly listed when signerWeights is provided`,
          );
        }
        accumulatedWeight += signerWeights[publicKey];
      } else {
        accumulatedWeight += 1;
      }
    }

    if (accumulatedWeight < requiredThreshold) {
      throw new ToolkitError(
        `Insufficient signatures: accumulated weight ${accumulatedWeight} is below required threshold ${requiredThreshold}`,
        {
          code: ErrorCode.INSUFFICIENT_SIGNATURES,
          category: 'transaction',
          recoverySuggestion:
            'Provide additional authorized signers whose combined unique weights meet or exceed the required threshold.',
          retryable: false,
          details: { accumulatedWeight, requiredThreshold },
        },
      );
    }

    for (const kp of uniqueKeypairs) {
      transaction.sign(kp);
    }

    return transaction;
  }
}
