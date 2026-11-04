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

export interface ContractCallOptions {
  contractId: string;
  method: string;
  args?: unknown[];
  signer?: string;
  fee?: string;
  network?: 'testnet' | 'mainnet' | 'futurenet';
  rpcUrl?: string;
}

export interface ContractSimulationResult<T = unknown> {
  result: T;
  cost: {
    cpuInsns: string;
    memBytes: string;
  };
  latestLedger: number;
}
