import { Server, TransactionBuilder, Operation, Keypair, Memo, BASE_FEE, Asset } from 'stellar-sdk';
import {
  PaymentOptions,
  PathPaymentOptions,
  PathPaymentStrictSendOptions,
} from '../types';
import { createAsset } from '../utils/asset';
import { findBestStrictSendPath } from '../utils/path';

export class PaymentManager {
  constructor(
    private server: Server,
    private networkPassphrase: string
  ) {}

  /**
   * Send a simple payment (XLM or custom asset)
   */
  async sendPayment(options: PaymentOptions): Promise<string> {
    const { from, to, amount, asset = 'native', memo } = options;

    try {
      const sourceKeypair = Keypair.fromSecret(from);
      const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

      const assetObj = createAsset(asset);

      const builder = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: to,
            asset: assetObj,
            amount,
          })
        )
        .setTimeout(180);

      if (memo) {
        builder.addMemo(Memo.text(memo));
      }

      const transaction = builder.build();
      transaction.sign(sourceKeypair);

      const result = await this.server.submitTransaction(transaction);
      return result.hash;
    } catch (error) {
      throw new Error(`Payment failed: ${error}`);
    }
  }

  /**
   * Send a path payment (automatic asset conversion)
   */
  async sendPathPayment(options: PathPaymentOptions): Promise<string> {
    const { from, to, sendAsset, destAsset, destAmount, maxSend, memo } = options;

    try {
      const sourceKeypair = Keypair.fromSecret(from);
      const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

      const sendAssetObj = createAsset(sendAsset);
      const destAssetObj = createAsset(destAsset);

      const builder = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.pathPaymentStrictReceive({
            sendAsset: sendAssetObj,
            sendMax: maxSend,
            destination: to,
            destAsset: destAssetObj,
            destAmount,
          })
        )
        .setTimeout(180);

      if (memo) {
        builder.addMemo(Memo.text(memo));
      }

      const transaction = builder.build();
      transaction.sign(sourceKeypair);

      const result = await this.server.submitTransaction(transaction);
      return result.hash;
    } catch (error) {
      throw new Error(`Path payment failed: ${error}`);
    }
  }

  /**
   * Send a strict-send path payment (exact source amount, minimum destination amount).
   */
  async sendPathPaymentStrictSend(options: PathPaymentStrictSendOptions): Promise<string> {
    const {
      from,
      to,
      sendAsset,
      sendAmount,
      destAsset,
      minDestAmount,
      path,
      memo,
    } = options;

    try {
      const sourceKeypair = Keypair.fromSecret(from);
      const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

      const sendAssetObj = createAsset(sendAsset);
      const destAssetObj = createAsset(destAsset);

      let resolvedPath: Asset[];
      if (path && path.length > 0) {
        resolvedPath = path.map((hop) => createAsset(hop));
      } else {
        const bestQuote = await findBestStrictSendPath(
          this.server,
          sendAssetObj,
          sendAmount,
          destAssetObj,
        );
        if (Number(bestQuote.destAmount) < Number(minDestAmount)) {
          throw new Error(
            `Slippage exceeded: best path yields ${bestQuote.destAmount}, which is below minDestAmount ${minDestAmount}`,
          );
        }
        resolvedPath = bestQuote.path;
      }

      const builder = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.pathPaymentStrictSend({
            sendAsset: sendAssetObj,
            sendAmount,
            destination: to,
            destAsset: destAssetObj,
            destMin: minDestAmount,
            path: resolvedPath,
          }),
        )
        .setTimeout(180);

      if (memo) {
        builder.addMemo(Memo.text(memo));
      }

      const transaction = builder.build();
      transaction.sign(sourceKeypair);

      const result = await this.server.submitTransaction(transaction);
      return result.hash;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Slippage exceeded') || error.message.includes('No path found'))
      ) {
        throw error;
      }
      throw new Error(`Strict send path payment failed: ${error}`);
    }
  }
}
