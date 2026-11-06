import { Transaction, FeeBumpTransaction } from 'stellar-sdk';
import {
  ToolkitConfig,
  AccountInfo,
  PaymentOptions,
  PathPaymentOptions,
  PathPaymentStrictSendOptions,
  TrustlineOptions,
  Balance,
  MultiSigConfig,
  FeeBumpOptions,
  CreateClaimableBalanceOptions,
  ClaimBalanceOptions,
  ClaimableBalanceRecord,
  LiquidityDepositOptions,
  LiquidityWithdrawOptions,
  LiquidityPoolInfo,
  CustomAsset,
} from './types';
import { createServer, getNetworkPassphrase, Server } from './utils/network';
import { AccountManager } from './core/account';
import { PaymentManager } from './core/payment';
import { TrustlineManager } from './core/trustline';
import { TransactionManager } from './core/transaction';
import { ClaimableBalanceManager } from './core/claimable';
import { LiquidityPoolManager } from './core/liquidity';
import { createAsset, formatAssetString } from './utils/asset';

export class StellarToolkit {
  private server: Server;
  private networkPassphrase: string;
  private accountManager: AccountManager;
  private paymentManager: PaymentManager;
  private trustlineManager: TrustlineManager;
  private transactionManager: TransactionManager;
  private claimableManager: ClaimableBalanceManager;
  private liquidityManager: LiquidityPoolManager;

  constructor(config: ToolkitConfig) {
    this.server = createServer(config.network, config.horizonUrl);
    this.networkPassphrase = getNetworkPassphrase(config.network);
    this.accountManager = new AccountManager(this.server, this.networkPassphrase);
    this.paymentManager = new PaymentManager(this.server, this.networkPassphrase);
    this.trustlineManager = new TrustlineManager(this.server, this.networkPassphrase);
    this.transactionManager = new TransactionManager(this.server, this.networkPassphrase);
    this.claimableManager = new ClaimableBalanceManager(this.server, this.networkPassphrase);
    this.liquidityManager = new LiquidityPoolManager(this.server, this.networkPassphrase);
  }

  // Account operations
  generateKeypair(): AccountInfo {
    return this.accountManager.generateKeypair();
  }

  async getAccount(publicKey: string) {
    return this.accountManager.loadAccount(publicKey);
  }

  async getBalances(publicKey: string): Promise<Balance[]> {
    return this.accountManager.getBalances(publicKey);
  }

  async accountExists(publicKey: string): Promise<boolean> {
    return this.accountManager.accountExists(publicKey);
  }

  async getNativeBalance(publicKey: string): Promise<string> {
    return this.accountManager.getNativeBalance(publicKey);
  }

  async fundTestnetAccount(publicKey: string): Promise<void> {
    return this.accountManager.fundTestnetAccount(publicKey);
  }

  // Multi-signature operations
  validateMultiSigConfig(config: MultiSigConfig): void {
    this.accountManager.validateMultiSigConfig(config);
  }

  async configureMultiSig(config: MultiSigConfig): Promise<string> {
    return this.accountManager.configureMultiSig(config);
  }

  async addSigner(masterSecret: string, signerPublicKey: string, weight: number): Promise<string> {
    return this.accountManager.addSigner(masterSecret, signerPublicKey, weight);
  }

  async removeSigner(masterSecret: string, signerPublicKey: string): Promise<string> {
    return this.accountManager.removeSigner(masterSecret, signerPublicKey);
  }

  signMultiSigTransaction(
    transaction: Transaction,
    signerSecrets: string[],
    requiredThreshold?: number,
    signerWeights?: Record<string, number>,
  ): Transaction {
    return this.accountManager.signMultiSigTransaction(
      transaction,
      signerSecrets,
      requiredThreshold,
      signerWeights,
    );
  }

  // Payment operations
  async sendPayment(options: PaymentOptions): Promise<string> {
    return this.paymentManager.sendPayment(options);
  }

  async sendPathPayment(options: PathPaymentOptions): Promise<string> {
    return this.paymentManager.sendPathPayment(options);
  }

  async sendPathPaymentStrictSend(options: PathPaymentStrictSendOptions): Promise<string> {
    return this.paymentManager.sendPathPaymentStrictSend(options);
  }

  // Trustline operations
  async addTrustline(options: TrustlineOptions): Promise<string> {
    return this.trustlineManager.addTrustline(options);
  }

  async removeTrustline(account: string, asset: { code: string; issuer: string }): Promise<string> {
    return this.trustlineManager.removeTrustline(account, asset);
  }

  // Fee bump transaction operations
  calculateSuggestedFee(innerTransaction: Transaction, multiplier?: number): string {
    return this.transactionManager.calculateSuggestedFee(innerTransaction, multiplier);
  }

  createFeeBumpTransaction(options: FeeBumpOptions): FeeBumpTransaction {
    return this.transactionManager.createFeeBumpTransaction(options);
  }

  async submitFeeBumpTransaction(options: FeeBumpOptions): Promise<string> {
    return this.transactionManager.submitFeeBumpTransaction(options);
  }

  // Claimable balance operations
  async createClaimableBalance(options: CreateClaimableBalanceOptions): Promise<string> {
    return this.claimableManager.createClaimableBalance(options);
  }

  async claimBalance(options: ClaimBalanceOptions): Promise<string> {
    return this.claimableManager.claimBalance(options);
  }

  async listClaimableBalances(publicKey: string): Promise<ClaimableBalanceRecord[]> {
    return this.claimableManager.listClaimableBalances(publicKey);
  }

  // Liquidity pool operations
  getPoolId(assetA: 'native' | CustomAsset, assetB: 'native' | CustomAsset): string {
    return this.liquidityManager.getPoolId(assetA, assetB);
  }

  calculateLpAmount(
    amountA: string | number,
    amountB: string | number,
    reserveA?: string | number,
    reserveB?: string | number,
    totalShares?: string | number,
  ): string {
    return this.liquidityManager.calculateLpAmount(
      amountA,
      amountB,
      reserveA,
      reserveB,
      totalShares,
    );
  }

  async depositLiquidity(options: LiquidityDepositOptions): Promise<string> {
    return this.liquidityManager.depositLiquidity(options);
  }

  async withdrawLiquidity(options: LiquidityWithdrawOptions): Promise<string> {
    return this.liquidityManager.withdrawLiquidity(options);
  }

  async getPoolInfo(poolId: string): Promise<LiquidityPoolInfo> {
    return this.liquidityManager.getPoolInfo(poolId);
  }

  // Utilities
  createAsset(code: string, issuer: string) {
    return createAsset({ code, issuer });
  }

  formatAsset(asset: 'native' | { code: string; issuer: string }): string {
    return formatAssetString(asset);
  }
}

export * from './types';
export * from './errors';
export * from './core/account';
export * from './core/payment';
export * from './core/trustline';
export * from './core/transaction';
export * from './core/claimable';
export * from './core/liquidity';
export * from './utils/path';
export * from './utils/asset';
export * from './utils/network';
