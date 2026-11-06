import { TransactionBuilder, Operation, Keypair, Memo, BASE_FEE } from 'stellar-sdk';
import { PaymentOptions, PathPaymentOptions, PathPaymentStrictSendOptions } from '../types';
import { createAsset } from '../utils/asset';
import { Server } from '../utils/network';
import { findStrictSendPaths } from '../utils/path';
import { InsufficientBalanceError } from '../errors';

export class PaymentManager {
  constructor(
    private server: Server,
    private networkPassphrase: string,
  ) {}

  /**
   * Send a payment
   */
  async sendPayment(options: PaymentOptions): Promise<string> {
    const { from, to, amount, asset = 'native', memo } = options;

    const sourceKeypair = Keypair.fromSecret(from);
    const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

    const assetCode = asset === 'native' ? 'XLM' : asset.code;
    const matchingBalance = (
      sourceAccount.balances as Array<{
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        balance: string;
      }>
    )?.find((b) =>
      asset === 'native'
        ? b.asset_type === 'native'
        : b.asset_code === asset.code && b.asset_issuer === asset.issuer,
    );

    if (matchingBalance && parseFloat(matchingBalance.balance) < parseFloat(amount)) {
      throw new InsufficientBalanceError(assetCode, amount, matchingBalance.balance);
    }

    try {
      const assetObj = createAsset(asset);

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: to,
            asset: assetObj,
            amount: amount,
          }),
        )
        .setTimeout(180);

      if (memo) {
        transaction.addMemo(Memo.text(memo));
      }

      const builtTransaction = transaction.build();
      builtTransaction.sign(sourceKeypair);

      const result = await this.server.submitTransaction(builtTransaction);
      return result.hash;
    } catch (error) {
      throw new Error(`Payment failed: ${error}`);
    }
  }

  /**
   * Send a path payment (strict receive)
   */
  async sendPathPayment(options: PathPaymentOptions): Promise<string> {
    const { from, to, sendAsset, destAsset, destAmount, maxSend } = options;

    try {
      const sourceKeypair = Keypair.fromSecret(from);
      const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

      const sendAssetObj = createAsset(sendAsset);
      const destAssetObj = createAsset(destAsset);

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.pathPaymentStrictReceive({
            sendAsset: sendAssetObj,
            sendMax: maxSend,
            destination: to,
            destAsset: destAssetObj,
            destAmount: destAmount,
            path: [],
          }),
        )
        .setTimeout(180)
        .build();

      transaction.sign(sourceKeypair);

      const result = await this.server.submitTransaction(transaction);
      return result.hash;
    } catch (error) {
      throw new Error(`Path payment failed: ${error}`);
    }
  }

  /**
   * Send a path payment strict send (exact source amount, minimum destination amount)
   */
  async sendPathPaymentStrictSend(options: PathPaymentStrictSendOptions): Promise<string> {
    const { from, to, sendAsset, sendAmount, destAsset, minDestAmount, path, memo } = options;

    if (parseFloat(sendAmount) <= 0 || parseFloat(minDestAmount) <= 0) {
      throw new Error('Amounts must be greater than zero');
    }

    const sourceKeypair = Keypair.fromSecret(from);
    const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

    let resolvedPath = path;
    if (!resolvedPath) {
      const quote = await findStrictSendPaths(this.server, sendAsset, sendAmount, destAsset);
      if (parseFloat(quote.destAmount) < parseFloat(minDestAmount)) {
        throw new Error(
          `Slippage exceeded: quoted destination amount ${quote.destAmount} is below minDestAmount ${minDestAmount}`,
        );
      }
      resolvedPath = quote.path;
    }

    const sendAssetObj = createAsset(sendAsset);
    const destAssetObj = createAsset(destAsset);
    const pathAssets = resolvedPath.map((hop) => createAsset(hop));

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
          path: pathAssets,
        }),
      )
      .setTimeout(180);

    if (memo) {
      builder.addMemo(Memo.text(memo));
    }

    const tx = builder.build();
    tx.sign(sourceKeypair);

    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }
}
