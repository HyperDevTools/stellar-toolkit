import {
  TransactionBuilder,
  Operation,
  Keypair,
  LiquidityPoolAsset,
  LiquidityPoolFeeV18,
  getLiquidityPoolId,
  BASE_FEE,
} from 'stellar-sdk';
import {
  CustomAsset,
  LiquidityDepositOptions,
  LiquidityWithdrawOptions,
  LiquidityPoolInfo,
} from '../types';
import { createAsset } from '../utils/asset';
import { Server } from '../utils/network';

export class LiquidityPoolManager {
  constructor(
    private server: Server,
    private networkPassphrase: string,
  ) {}

  /**
   * Compute the deterministic Stellar constant-product liquidity pool ID (hex)
   */
  getPoolId(assetA: 'native' | CustomAsset, assetB: 'native' | CustomAsset): string {
    const a = createAsset(assetA);
    const b = createAsset(assetB);
    const poolIdBuf = getLiquidityPoolId('constant_product', {
      assetA: a,
      assetB: b,
      fee: LiquidityPoolFeeV18,
    });
    return poolIdBuf.toString('hex');
  }

  /**
   * Calculate expected LP share tokens for a constant-product deposit
   */
  calculateLpAmount(
    amountA: string | number,
    amountB: string | number,
    reserveA?: string | number,
    reserveB?: string | number,
    totalShares?: string | number,
  ): string {
    const a = Number(amountA);
    const b = Number(amountB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
      throw new Error('Deposit amounts must be positive numbers');
    }

    if (
      reserveA !== undefined &&
      reserveB !== undefined &&
      totalShares !== undefined &&
      Number(totalShares) > 0
    ) {
      const rA = Number(reserveA);
      const rB = Number(reserveB);
      const shares = Number(totalShares);
      const minted = Math.min((a * shares) / rA, (b * shares) / rB);
      return minted.toFixed(7);
    }

    return Math.sqrt(a * b).toFixed(7);
  }

  /**
   * Validate that the current pool spot price falls within [minPrice, maxPrice]
   */
  validatePriceSlippage(spotPrice: number, minPrice: number, maxPrice: number): void {
    if (minPrice <= 0 || maxPrice <= 0 || minPrice > maxPrice) {
      throw new Error('Invalid price bounds');
    }
    if (spotPrice < minPrice || spotPrice > maxPrice) {
      throw new Error(
        `Slippage error: pool spot price ${spotPrice} is outside allowed range [${minPrice}, ${maxPrice}]`,
      );
    }
  }

  /**
   * Deposit tokens into a constant-product AMM liquidity pool
   */
  async depositLiquidity(options: LiquidityDepositOptions): Promise<string> {
    const { accountSecret, assetA, assetB, maxAmountA, maxAmountB, minPrice, maxPrice, spotPrice } =
      options;

    const minP = parseFloat(minPrice);
    const maxP = parseFloat(maxPrice);
    const impliedPrice = spotPrice ?? parseFloat(maxAmountA) / parseFloat(maxAmountB);
    this.validatePriceSlippage(impliedPrice, minP, maxP);

    const keypair = Keypair.fromSecret(accountSecret);
    const sourceAccount = await this.server.loadAccount(keypair.publicKey());
    const poolId = this.getPoolId(assetA, assetB);
    const lpAsset = new LiquidityPoolAsset(
      createAsset(assetA),
      createAsset(assetB),
      LiquidityPoolFeeV18,
    );

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.changeTrust({
          asset: lpAsset,
        }),
      )
      .addOperation(
        Operation.liquidityPoolDeposit({
          liquidityPoolId: poolId,
          maxAmountA,
          maxAmountB,
          minPrice,
          maxPrice,
        }),
      )
      .setTimeout(180)
      .build();

    tx.sign(keypair);
    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Withdraw liquidity from a constant-product AMM liquidity pool
   */
  async withdrawLiquidity(options: LiquidityWithdrawOptions): Promise<string> {
    const { accountSecret, assetA, assetB, sharesAmount, minAmountA, minAmountB } = options;

    if (parseFloat(sharesAmount) <= 0) {
      throw new Error('sharesAmount must be positive');
    }

    const keypair = Keypair.fromSecret(accountSecret);
    const sourceAccount = await this.server.loadAccount(keypair.publicKey());
    const poolId = this.getPoolId(assetA, assetB);

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.liquidityPoolWithdraw({
          liquidityPoolId: poolId,
          amount: sharesAmount,
          minAmountA,
          minAmountB,
        }),
      )
      .setTimeout(180)
      .build();

    tx.sign(keypair);
    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Query liquidity pool reserves and metadata from Horizon
   */
  async getPoolInfo(poolId: string): Promise<LiquidityPoolInfo> {
    const record = await this.server.liquidityPools().liquidityPoolId(poolId).call();
    return {
      id: record.id,
      feeBp: record.fee_bp,
      type: record.type,
      totalTrustlines: record.total_trustlines,
      totalShares: record.total_shares,
      reserves: record.reserves,
    };
  }
}
