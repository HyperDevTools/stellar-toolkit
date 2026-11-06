export type NetworkType = 'mainnet' | 'testnet';

export interface ToolkitConfig {
  network: NetworkType;
  horizonUrl?: string;
}

export interface AccountInfo {
  publicKey: string;
  secret?: string;
}

export interface CustomAsset {
  code: string;
  issuer: string;
}

export interface PaymentOptions {
  from: string;
  to: string;
  amount: string;
  asset?: 'native' | CustomAsset;
  memo?: string;
}

export interface PathPaymentOptions {
  from: string;
  to: string;
  sendAsset: 'native' | CustomAsset;
  destAsset: 'native' | CustomAsset;
  destAmount: string;
  maxSend: string;
}

export interface PathPaymentStrictSendOptions {
  from: string;
  to: string;
  sendAsset: 'native' | CustomAsset;
  sendAmount: string;
  destAsset: 'native' | CustomAsset;
  minDestAmount: string;
  path?: ('native' | CustomAsset)[];
  memo?: string;
}

export interface TrustlineOptions {
  account: string;
  asset: CustomAsset;
  limit?: string;
}

export interface Balance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
}

export interface SignerConfig {
  publicKey: string;
  weight: number;
}

export interface MultiSigThresholds {
  low: number;
  medium: number;
  high: number;
}

export interface MultiSigConfig {
  masterSecret: string;
  signers: SignerConfig[];
  masterWeight?: number;
  thresholds: MultiSigThresholds;
}

export interface FeeBumpOptions {
  feeSourceSecret: string;
  innerTransaction: unknown;
  maxFeePerOp?: number | string;
}

export type ClaimPredicateType =
  | { type: 'unconditional' }
  | { type: 'not_before'; unixTimestamp: number }
  | { type: 'before'; unixTimestamp: number }
  | { type: 'and'; predicates: ClaimPredicateType[] }
  | { type: 'or'; predicates: ClaimPredicateType[] };

export interface ClaimantConfig {
  destination: string;
  predicate?: ClaimPredicateType;
}

export interface CreateClaimableBalanceOptions {
  from: string;
  asset: 'native' | CustomAsset;
  amount: string;
  claimants: ClaimantConfig[];
}

export interface ClaimBalanceOptions {
  claimantSecret: string;
  balanceId: string;
  unlockTimestamp?: number;
}

export interface ClaimableBalanceRecord {
  id: string;
  asset: string;
  amount: string;
  sponsor?: string;
  claimants: Array<{
    destination: string;
    predicate: Record<string, unknown>;
  }>;
}

export interface LiquidityDepositOptions {
  accountSecret: string;
  assetA: 'native' | CustomAsset;
  assetB: 'native' | CustomAsset;
  maxAmountA: string;
  maxAmountB: string;
  minPrice: string;
  maxPrice: string;
  spotPrice?: number;
}

export interface LiquidityWithdrawOptions {
  accountSecret: string;
  assetA: 'native' | CustomAsset;
  assetB: 'native' | CustomAsset;
  sharesAmount: string;
  minAmountA: string;
  minAmountB: string;
}

export interface LiquidityPoolInfo {
  id: string;
  feeBp: number;
  type: string;
  totalTrustlines: string;
  totalShares: string;
  reserves: Array<{
    asset: string;
    amount: string;
  }>;
}

export type ErrorCategory = 'account' | 'network' | 'transaction' | 'validation';

export enum ErrorCode {
  ACCOUNT_NOT_FOUND = 'ERR_ACCOUNT_NOT_FOUND',
  INSUFFICIENT_BALANCE = 'ERR_INSUFFICIENT_BALANCE',
  INVALID_THRESHOLD = 'ERR_INVALID_THRESHOLD',
  INSUFFICIENT_SIGNATURES = 'ERR_INSUFFICIENT_SIGNATURES',
  NETWORK_TIMEOUT = 'ERR_NETWORK_TIMEOUT',
  NETWORK_CONNECTION = 'ERR_NETWORK_CONNECTION',
  TRANSACTION_REJECTED = 'ERR_TRANSACTION_REJECTED',
  VALIDATION_FAILED = 'ERR_VALIDATION_FAILED',
}
