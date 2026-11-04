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

export interface PathPaymentStrictSendOptions {
  from: string;
  to: string;
  sendAsset: 'native' | CustomAsset;
  sendAmount: string;
  destAsset: 'native' | CustomAsset;
  minDestAmount: string;
  path?: Array<'native' | CustomAsset>;
  memo?: string;
}
