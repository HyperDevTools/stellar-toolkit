import { Server } from 'stellar-sdk';
import {
  ToolkitConfig,
  AccountInfo,
  PaymentOptions,
  PathPaymentOptions,
  TrustlineOptions,
  Balance,
  ContractCallOptions,
  ContractSimulationResult,
} from './types';
import { createServer, getNetworkPassphrase } from './utils/network';
import { AccountManager } from './core/account';
import { PaymentManager } from './core/payment';
import { TrustlineManager } from './core/trustline';
import { ContractManager } from './core/contract';
import { createAsset, formatAssetString } from './utils/asset';

export class StellarToolkit {
  private server: Server;
  private networkPassphrase: string;
  private accountManager: AccountManager;
  private paymentManager: PaymentManager;
  private trustlineManager: TrustlineManager;
  private contractManager: ContractManager;

  constructor(config: ToolkitConfig) {
    this.server = createServer(config.network, config.horizonUrl);
    this.networkPassphrase = getNetworkPassphrase(config.network);
    this.accountManager = new AccountManager(this.server);
    this.paymentManager = new PaymentManager(this.server, this.networkPassphrase);
    this.trustlineManager = new TrustlineManager(this.server, this.networkPassphrase);
    this.contractManager = new ContractManager(this.networkPassphrase, config.network);
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

  // Payment operations
  async sendPayment(options: PaymentOptions): Promise<string> {
    return this.paymentManager.sendPayment(options);
  }

  async sendPathPayment(options: PathPaymentOptions): Promise<string> {
    return this.paymentManager.sendPathPayment(options);
  }

  // Trustline operations
  async addTrustline(options: TrustlineOptions): Promise<string> {
    return this.trustlineManager.addTrustline(options);
  }

  async removeTrustline(account: string, asset: { code: string; issuer: string }): Promise<string> {
    return this.trustlineManager.removeTrustline(account, asset);
  }

  // Utilities
  createAsset(code: string, issuer: string) {
    return createAsset({ code, issuer });
  }

  formatAsset(asset: 'native' | { code: string; issuer: string }): string {
    return formatAssetString(asset);
  }
}

// Export types
export * from './types';

export { ContractManager } from './core/contract';
