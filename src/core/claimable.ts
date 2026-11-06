import { TransactionBuilder, Operation, Keypair, Claimant, BASE_FEE, xdr } from 'stellar-sdk';
import {
  ClaimPredicateType,
  CreateClaimableBalanceOptions,
  ClaimBalanceOptions,
  ClaimableBalanceRecord,
} from '../types';
import { createAsset } from '../utils/asset';
import { Server } from '../utils/network';

export class ClaimableBalanceManager {
  constructor(
    private server: Server,
    private networkPassphrase: string,
  ) {}

  /**
   * Convert a high-level ClaimPredicateType into a Stellar XDR ClaimPredicate
   */
  buildPredicate(predicate?: ClaimPredicateType): xdr.ClaimPredicate {
    if (!predicate || predicate.type === 'unconditional') {
      return Claimant.predicateUnconditional();
    }
    if (predicate.type === 'not_before') {
      // Unlock NOT BEFORE unixTimestamp => NOT(beforeAbsoluteTime(unixTimestamp))
      return Claimant.predicateNot(
        Claimant.predicateBeforeAbsoluteTime(String(predicate.unixTimestamp)),
      );
    }
    if (predicate.type === 'before') {
      return Claimant.predicateBeforeAbsoluteTime(String(predicate.unixTimestamp));
    }
    if (predicate.type === 'and') {
      if (predicate.predicates.length !== 2) {
        throw new Error('AND predicate requires exactly 2 child predicates');
      }
      return Claimant.predicateAnd(
        this.buildPredicate(predicate.predicates[0]),
        this.buildPredicate(predicate.predicates[1]),
      );
    }
    if (predicate.type === 'or') {
      if (predicate.predicates.length !== 2) {
        throw new Error('OR predicate requires exactly 2 child predicates');
      }
      return Claimant.predicateOr(
        this.buildPredicate(predicate.predicates[0]),
        this.buildPredicate(predicate.predicates[1]),
      );
    }
    throw new Error('Unsupported claim predicate');
  }

  /**
   * Create a claimable balance with unconditional or time-locked predicates
   */
  async createClaimableBalance(options: CreateClaimableBalanceOptions): Promise<string> {
    const { from, asset, amount, claimants } = options;
    if (!claimants || claimants.length === 0) {
      throw new Error('At least one claimant is required');
    }

    const sourceKeypair = Keypair.fromSecret(from);
    const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());
    const assetObj = createAsset(asset);

    const stellarClaimants = claimants.map(
      (c) => new Claimant(c.destination, this.buildPredicate(c.predicate)),
    );

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.createClaimableBalance({
          asset: assetObj,
          amount,
          claimants: stellarClaimants,
        }),
      )
      .setTimeout(180)
      .build();

    tx.sign(sourceKeypair);
    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Claim an existing claimable balance by balanceId
   */
  async claimBalance(options: ClaimBalanceOptions): Promise<string> {
    const { claimantSecret, balanceId, unlockTimestamp } = options;
    if (!balanceId) {
      throw new Error('balanceId is required');
    }

    if (unlockTimestamp !== undefined) {
      const nowSecs = Math.floor(Date.now() / 1000);
      if (nowSecs < unlockTimestamp) {
        throw new Error(
          `Claimable balance ${balanceId} is still locked until timestamp ${unlockTimestamp}`,
        );
      }
    }

    const claimantKeypair = Keypair.fromSecret(claimantSecret);
    const sourceAccount = await this.server.loadAccount(claimantKeypair.publicKey());

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.claimClaimableBalance({
          balanceId,
        }),
      )
      .setTimeout(180)
      .build();

    tx.sign(claimantKeypair);
    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * List claimable balances available for a claimant public key
   */
  async listClaimableBalances(publicKey: string): Promise<ClaimableBalanceRecord[]> {
    const response = await this.server.claimableBalances().claimant(publicKey).call();
    return (response.records || []).map((rec) => ({
      id: rec.id,
      asset: rec.asset,
      amount: rec.amount,
      sponsor: rec.sponsor,
      claimants: rec.claimants as Array<{
        destination: string;
        predicate: Record<string, unknown>;
      }>,
    }));
  }
}
