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
import { AccountInfo, Balance, MultiSigConfig } from '../types';
import { Server } from '../utils/network';
import {
  AccountNotFoundError,
  NetworkConnectionError,
  NetworkTimeoutError,
  ValidationError,
} from '../errors';

export type AccountResponse = Horizon.AccountResponse;

export const MAX_STELLAR_SIGNERS = 20;

export class AccountManager {
  constructor(
    private server: Server,
    private networkPassphrase: string = Networks.TESTNET,
  ) {}

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
      const result = error as { response?: { status?: number }; code?: string } | undefined;
      const status = result?.response?.status;
      if (status === 404 || error instanceof NotFoundError) {
        throw new AccountNotFoundError(publicKey);
      }
      if (
        status === 408 ||
        status === 504 ||
        result?.code === 'ECONNABORTED' ||
        result?.code === 'ETIMEDOUT' ||
        (error instanceof Error && /^timeout of \d+ms exceeded$/i.test(error.message))
      ) {
        throw new NetworkTimeoutError('Horizon account lookup');
      }
      throw new NetworkConnectionError(
        'account lookup',
        status === undefined ? undefined : `HTTP ${status}`,
      );
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
    } catch (error) {
      if (error instanceof AccountNotFoundError) return false;
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
      response = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`,
      );
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
   * Sign a transaction with multiple signers and verify threshold satisfaction
   */
  signMultiSigTransaction(
    transaction: Transaction,
    signerSecrets: string[],
    requiredThreshold = 1,
    signerWeights?: Record<string, number>,
  ): Transaction {
    if (!Number.isInteger(requiredThreshold) || requiredThreshold < 1 || requiredThreshold > 255) {
      throw new ValidationError('requiredThreshold', 'Threshold must be an integer from 1 to 255');
    }
    for (const weight of Object.values(signerWeights ?? {})) {
      if (!Number.isInteger(weight) || weight < 0 || weight > 255) {
        throw new ValidationError('signerWeights', 'Each weight must be an integer from 0 to 255');
      }
    }

    const signers = Array.from(new Set(signerSecrets), (secret) => Keypair.fromSecret(secret));
    const accumulatedWeight = signers.reduce((total, signer) => {
      if (!signerWeights) return total + 1;
      const key = signer.publicKey();
      return (
        total + (Object.prototype.hasOwnProperty.call(signerWeights, key) ? signerWeights[key] : 0)
      );
    }, 0);

    if (accumulatedWeight < requiredThreshold) {
      throw new ValidationError(
        'signerWeights',
        `Insufficient signatures: accumulated weight ${accumulatedWeight} is below required threshold ${requiredThreshold}`,
      );
    }
    transaction.sign(...signers);
    return transaction;
  }
}
