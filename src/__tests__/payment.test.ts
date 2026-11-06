import { Account, Keypair } from 'stellar-sdk';
import { StellarToolkit } from '../index';

describe('StellarToolkit - Path Payment Strict Send', () => {
  let toolkit: StellarToolkit;
  const usdc = {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  };
  const eurc = {
    code: 'EURC',
    issuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2',
  };

  beforeEach(() => {
    toolkit = new StellarToolkit({ network: 'testnet' });
  });

  const setupMockServer = (
    pathRecords: Array<{
      destination_amount: string;
      path: Array<{ asset_type: string; asset_code?: string; asset_issuer?: string }>;
    }>,
  ) => {
    const server = (
      toolkit as unknown as {
        server: {
          loadAccount: jest.Mock;
          submitTransaction: jest.Mock;
          strictSendPaths: jest.Mock;
        };
      }
    ).server;

    jest.spyOn(server, 'loadAccount').mockImplementation(async (pubKey: string) => {
      return new Account(pubKey, '200') as unknown as never;
    });
    jest
      .spyOn(server, 'submitTransaction')
      .mockResolvedValue({ hash: 'strict_send_tx_hash' } as unknown as never);
    server.strictSendPaths = jest.fn().mockReturnValue({
      call: jest.fn().mockResolvedValue({ records: pathRecords }),
    });
    return server;
  };

  it('test_strict_send_native_to_asset', async () => {
    const sender = Keypair.random();
    const recipient = Keypair.random();
    setupMockServer([{ destination_amount: '95.5000000', path: [] }]);

    const hash = await toolkit.sendPathPaymentStrictSend({
      from: sender.secret(),
      to: recipient.publicKey(),
      sendAsset: 'native',
      sendAmount: '100',
      destAsset: usdc,
      minDestAmount: '90',
    });

    expect(hash).toBe('strict_send_tx_hash');
  });

  it('test_strict_send_with_path', async () => {
    const sender = Keypair.random();
    const recipient = Keypair.random();
    const server = setupMockServer([]);

    const hash = await toolkit.sendPathPaymentStrictSend({
      from: sender.secret(),
      to: recipient.publicKey(),
      sendAsset: 'native',
      sendAmount: '100',
      destAsset: usdc,
      minDestAmount: '90',
      path: [eurc],
      memo: 'Custom 2-hop strict send',
    });

    expect(hash).toBe('strict_send_tx_hash');
    expect(server.strictSendPaths).not.toHaveBeenCalled();
  });

  it('test_strict_send_slippage', async () => {
    const sender = Keypair.random();
    const recipient = Keypair.random();
    setupMockServer([{ destination_amount: '85.0000000', path: [] }]);

    await expect(
      toolkit.sendPathPaymentStrictSend({
        from: sender.secret(),
        to: recipient.publicKey(),
        sendAsset: 'native',
        sendAmount: '100',
        destAsset: usdc,
        minDestAmount: '90',
      }),
    ).rejects.toThrow(/Slippage exceeded/i);
  });

  it('test_strict_send_no_path', async () => {
    const sender = Keypair.random();
    const recipient = Keypair.random();
    setupMockServer([]);

    await expect(
      toolkit.sendPathPaymentStrictSend({
        from: sender.secret(),
        to: recipient.publicKey(),
        sendAsset: 'native',
        sendAmount: '100',
        destAsset: usdc,
        minDestAmount: '90',
      }),
    ).rejects.toThrow(/No path found/i);
  });

  it('test_strict_send_auto_path', async () => {
    const sender = Keypair.random();
    const recipient = Keypair.random();
    const server = setupMockServer([
      {
        destination_amount: '91.0000000',
        path: [],
      },
      {
        destination_amount: '96.2500000',
        path: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: eurc.code,
            asset_issuer: eurc.issuer,
          },
        ],
      },
    ]);

    const hash = await toolkit.sendPathPaymentStrictSend({
      from: sender.secret(),
      to: recipient.publicKey(),
      sendAsset: 'native',
      sendAmount: '100',
      destAsset: usdc,
      minDestAmount: '95',
    });

    expect(hash).toBe('strict_send_tx_hash');
    expect(server.strictSendPaths).toHaveBeenCalledTimes(1);
  });

  it('covers sendPayment, sendPathPayment, and trustline helpers', async () => {
    const sender = Keypair.random();
    const recipient = Keypair.random();
    setupMockServer([{ destination_amount: '95.0000000', path: [{ asset_type: 'native' }] }]);

    const pHash = await toolkit.sendPayment({
      from: sender.secret(),
      to: recipient.publicKey(),
      amount: '10',
      asset: 'native',
      memo: 'hello',
    });
    expect(pHash).toBe('strict_send_tx_hash');

    const ppHash = await toolkit.sendPathPayment({
      from: sender.secret(),
      to: recipient.publicKey(),
      sendAsset: 'native',
      destAsset: usdc,
      destAmount: '10',
      maxSend: '12',
    });
    expect(ppHash).toBe('strict_send_tx_hash');

    const tlHash = await toolkit.addTrustline({
      account: sender.secret(),
      asset: usdc,
      limit: '1000',
    });
    expect(tlHash).toBe('strict_send_tx_hash');

    const rmHash = await toolkit.removeTrustline(sender.secret(), usdc);
    expect(rmHash).toBe('strict_send_tx_hash');
    expect(toolkit.createAsset('USDC', usdc.issuer).getCode()).toBe('USDC');
  });
});
