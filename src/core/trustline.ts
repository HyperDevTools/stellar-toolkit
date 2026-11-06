import { TransactionBuilder, Operation, Keypair, BASE_FEE } from 'stellar-sdk';
import { TrustlineOptions } from '../types';
import { createAsset } from '../utils/asset';
import { Server } from '../utils/network';

export class TrustlineManager {
  constructor(
    private server: Server,
    private networkPassphrase: string,
  ) {}

  /**
   * Add a trustline to an account
   */
  async addTrustline(options: TrustlineOptions): Promise<string> {
    const { account, asset, limit } = options;

    try {
      const sourceKeypair = Keypair.fromSecret(account);
      const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

      const assetObj = createAsset(asset);

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.changeTrust({
            asset: assetObj,
            limit: limit,
          }),
        )
        .setTimeout(180)
        .build();

      transaction.sign(sourceKeypair);

      const result = await this.server.submitTransaction(transaction);
      return result.hash;
    } catch (error) {
      throw new Error(`Failed to add trustline: ${error}`);
    }
  }

  /**
   * Remove a trustline from an account
   */
  async removeTrustline(account: string, asset: { code: string; issuer: string }): Promise<string> {
    return this.addTrustline({
      account,
      asset,
      limit: '0',
    });
  }
}
