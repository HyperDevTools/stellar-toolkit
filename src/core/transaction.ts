import {
  TransactionBuilder,
  Transaction,
  FeeBumpTransaction,
  Keypair,
  BASE_FEE,
} from 'stellar-sdk';
import { FeeBumpOptions } from '../types';
import { Server } from '../utils/network';

export class TransactionManager {
  constructor(
    private server: Server,
    private networkPassphrase: string,
  ) {}

  /**
   * Calculate a suggested bumped fee per operation for an inner transaction
   */
  calculateSuggestedFee(innerTransaction: Transaction, multiplier = 2): string {
    if (!innerTransaction || !Array.isArray(innerTransaction.operations)) {
      throw new Error('Invalid transaction: missing operations');
    }
    const opCount = Math.max(1, innerTransaction.operations.length);
    const currentTotalFee = parseInt(String(innerTransaction.fee), 10) || parseInt(BASE_FEE, 10);
    const currentPerOp = Math.ceil(currentTotalFee / opCount);
    const bumpedPerOp = Math.max(
      currentPerOp + 1,
      Math.ceil(currentPerOp * Math.max(1.1, multiplier)),
    );
    return String(bumpedPerOp);
  }

  /**
   * Validate that an inner transaction is eligible for a fee bump
   */
  validateFeeBumpEligibility(innerTransaction: Transaction, newMaxFeePerOp: number): void {
    if (
      !innerTransaction ||
      typeof innerTransaction.toXDR !== 'function' ||
      !Array.isArray(innerTransaction.operations) ||
      innerTransaction.operations.length === 0
    ) {
      throw new Error('Invalid transaction: cannot fee-bump malformed transaction');
    }

    // Check envelope version: only v1 transactions can be wrapped in a FeeBumpTransaction
    const envelopeTypeName =
      innerTransaction.toEnvelope?.()?.switch?.()?.name ||
      (innerTransaction as unknown as { _envelopeType?: string })._envelopeType;
    if (envelopeTypeName === 'envelopeTypeTxV0') {
      throw new Error('Only v1 transactions are supported for fee bump (v0 envelope rejected)');
    }

    const opCount = innerTransaction.operations.length;
    const oldTotalFee = parseInt(String(innerTransaction.fee), 10);
    const newTotalFee = newMaxFeePerOp * (opCount + 1);
    const oldPerOpFee = oldTotalFee / opCount;

    if (
      !Number.isFinite(newMaxFeePerOp) ||
      newMaxFeePerOp <= oldPerOpFee ||
      newTotalFee <= oldTotalFee
    ) {
      throw new Error(
        `Fee too low: new per-op fee (${newMaxFeePerOp}) must exceed original per-op fee (${oldPerOpFee})`,
      );
    }
  }

  /**
   * Build and sign a FeeBumpTransaction preserving the inner transaction
   */
  createFeeBumpTransaction(options: FeeBumpOptions): FeeBumpTransaction {
    const { feeSourceSecret, innerTransaction, maxFeePerOp } = options;
    const feeKeypair = Keypair.fromSecret(feeSourceSecret);

    let parsedInner: Transaction;
    if (typeof innerTransaction === 'string') {
      try {
        const parsed = TransactionBuilder.fromXDR(innerTransaction, this.networkPassphrase);
        if (parsed instanceof FeeBumpTransaction) {
          throw new Error('Invalid transaction: inner transaction is already a FeeBumpTransaction');
        }
        parsedInner = parsed;
      } catch (error) {
        throw new Error(`Invalid transaction XDR: ${error}`);
      }
    } else if (innerTransaction && typeof (innerTransaction as Transaction).toXDR === 'function') {
      parsedInner = innerTransaction as Transaction;
    } else {
      throw new Error('Invalid transaction provided for fee bump');
    }

    const resolvedFeeStr =
      maxFeePerOp !== undefined ? String(maxFeePerOp) : this.calculateSuggestedFee(parsedInner, 2);
    const resolvedFeeNum = parseInt(resolvedFeeStr, 10);

    this.validateFeeBumpEligibility(parsedInner, resolvedFeeNum);

    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      feeKeypair,
      resolvedFeeStr,
      parsedInner,
      this.networkPassphrase,
    );
    feeBumpTx.sign(feeKeypair);

    return feeBumpTx;
  }

  /**
   * Create and submit a FeeBumpTransaction to Horizon
   */
  async submitFeeBumpTransaction(options: FeeBumpOptions): Promise<string> {
    const feeBumpTx = this.createFeeBumpTransaction(options);
    const result = await this.server.submitTransaction(feeBumpTx);
    return result.hash;
  }
}
