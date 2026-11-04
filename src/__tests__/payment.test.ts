import { Account, Keypair, Server } from 'stellar-sdk';
import { PaymentManager } from '../core/payment';
import { getNetworkPassphrase } from '../utils/network';

describe('PaymentManager - Path Payment Strict Send', () => {
  const passphrase = getNetworkPassphrase('testnet');
  const sender = Keypair.random();
  const recipient = Keypair.random();
  const usdcAsset = {
    code: 'USDC',
    issuer: Keypair.random().publicKey(),
  };
  const hopAsset = {
    code: 'AQUA',
    issuer: Keypair.random().publicKey(),
  };

  const createMockServer = (
    pathRecords: Array<Record<string, unknown>> = [
      {
        destination_amount: '98.5000000',
        path: [],
      },
    ],
  ): Server => {
    const account = new Account(sender.publicKey(), '500');
    return {
      loadAccount: jest.fn().mockResolvedValue(account),
      submitTransaction: jest.fn().mockResolvedValue({ hash: 'strict_send_hash_001' }),
      strictSendPaths: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ records: pathRecords }),
      }),
    } as unknown as Server;
  };

  it('test_strict_send_native_to_asset', async () => {
    const server = createMockServer();
    const manager = new PaymentManager(server, passphrase);

    const hash = await manager.sendPathPaymentStrictSend({
      from: sender.secret(),
      to: recipient.publicKey(),
      sendAsset: 'native',
      sendAmount: '100',
      destAsset: usdcAsset,
      minDestAmount: '95',
    });

    expect(hash).toBe('strict_send_hash_001');
    expect(server.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('test_strict_send_with_path', async () => {
    const server = createMockServer();
    const manager = new PaymentManager(server, passphrase);

    const hash = await manager.sendPathPaymentStrictSend({
      from: sender.secret(),
      to: recipient.publicKey(),
      sendAsset: 'native',
      sendAmount: '100',
      destAsset: usdcAsset,
      minDestAmount: '90',
      path: [hopAsset],
    });

    expect(hash).toBe('strict_send_hash_001');
    expect(server.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('test_strict_send_slippage', async () => {
    const server = createMockServer([
      {
        destination_amount: '90.0000000',
        path: [],
      },
    ]);
    const manager = new PaymentManager(server, passphrase);

    await expect(
      manager.sendPathPaymentStrictSend({
        from: sender.secret(),
        to: recipient.publicKey(),
        sendAsset: 'native',
        sendAmount: '100',
        destAsset: usdcAsset,
        minDestAmount: '95',
      }),
    ).rejects.toThrow(/slippage exceeded/i);
  });

  it('test_strict_send_no_path', async () => {
    const server = createMockServer([]);
    const manager = new PaymentManager(server, passphrase);

    await expect(
      manager.sendPathPaymentStrictSend({
        from: sender.secret(),
        to: recipient.publicKey(),
        sendAsset: 'native',
        sendAmount: '100',
        destAsset: usdcAsset,
        minDestAmount: '95',
      }),
    ).rejects.toThrow(/no path found/i);
  });

  it('test_strict_send_auto_path', async () => {
    const server = createMockServer([
      {
        destination_amount: '96.0000000',
        path: [{ asset_type: 'native' }],
      },
      {
        destination_amount: '99.2500000',
        path: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: hopAsset.code,
            asset_issuer: hopAsset.issuer,
          },
        ],
      },
    ]);
    const manager = new PaymentManager(server, passphrase);

    const hash = await manager.sendPathPaymentStrictSend({
      from: sender.secret(),
      to: recipient.publicKey(),
      sendAsset: 'native',
      sendAmount: '100',
      destAsset: usdcAsset,
      minDestAmount: '98',
    });

    expect(hash).toBe('strict_send_hash_001');
    expect(server.strictSendPaths).toHaveBeenCalledTimes(1);
    expect(server.submitTransaction).toHaveBeenCalledTimes(1);
  });
});
