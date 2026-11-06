import { Account, Keypair } from 'stellar-sdk';
import { StellarToolkit } from '../index';

describe('StellarToolkit - Claimable Balance Helpers', () => {
  let toolkit: StellarToolkit;

  beforeEach(() => {
    toolkit = new StellarToolkit({ network: 'testnet' });
    const server = (
      toolkit as unknown as {
        server: {
          loadAccount: jest.Mock;
          submitTransaction: jest.Mock;
          claimableBalances: jest.Mock;
        };
      }
    ).server;

    jest.spyOn(server, 'loadAccount').mockImplementation(async (pubKey: string) => {
      return new Account(pubKey, '300') as unknown as never;
    });
    jest
      .spyOn(server, 'submitTransaction')
      .mockResolvedValue({ hash: 'claimable_tx_hash_001' } as unknown as never);
    server.claimableBalances = jest.fn().mockReturnValue({
      claimant: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({
          records: [
            {
              id: '00000000da0d57da7d4850e7fc10d2a9d0ebc731f7afb40574c03395b17d49149b91f5be',
              asset: 'native',
              amount: '50.0000000',
              sponsor: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
              claimants: [
                {
                  destination: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
                  predicate: { unconditional: true },
                },
              ],
            },
          ],
        }),
      }),
    });
  });

  it('test_create_claimable_unconditional', async () => {
    const sender = Keypair.random();
    const recipient = Keypair.random();

    const hash = await toolkit.createClaimableBalance({
      from: sender.secret(),
      asset: 'native',
      amount: '50',
      claimants: [
        {
          destination: recipient.publicKey(),
          predicate: { type: 'unconditional' },
        },
      ],
    });

    expect(hash).toBe('claimable_tx_hash_001');
  });

  it('test_create_claimable_time_locked', async () => {
    const sender = Keypair.random();
    const recipient = Keypair.random();
    const unlockAt = Math.floor(Date.now() / 1000) + 3600;

    const hash = await toolkit.createClaimableBalance({
      from: sender.secret(),
      asset: 'native',
      amount: '100',
      claimants: [
        {
          destination: recipient.publicKey(),
          predicate: { type: 'not_before', unixTimestamp: unlockAt },
        },
      ],
    });

    expect(hash).toBe('claimable_tx_hash_001');
  });

  it('test_claim_balance', async () => {
    const claimant = Keypair.random();
    const balanceId = '00000000da0d57da7d4850e7fc10d2a9d0ebc731f7afb40574c03395b17d49149b91f5be';

    const hash = await toolkit.claimBalance({
      claimantSecret: claimant.secret(),
      balanceId,
      unlockTimestamp: Math.floor(Date.now() / 1000) - 60,
    });

    expect(hash).toBe('claimable_tx_hash_001');
  });

  it('test_claim_locked_balance', async () => {
    const claimant = Keypair.random();
    const balanceId = '00000000da0d57da7d4850e7fc10d2a9d0ebc731f7afb40574c03395b17d49149b91f5be';
    const futureUnlock = Math.floor(Date.now() / 1000) + 86400;

    await expect(
      toolkit.claimBalance({
        claimantSecret: claimant.secret(),
        balanceId,
        unlockTimestamp: futureUnlock,
      }),
    ).rejects.toThrow(/still locked/i);
  });

  it('test_list_claimable_balances', async () => {
    const claimant = Keypair.random();
    const list = await toolkit.listClaimableBalances(claimant.publicKey());

    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe('50.0000000');
  });

  it('supports combination AND/OR and before predicates', async () => {
    const sender = Keypair.random();
    const recipient = Keypair.random();
    const now = Math.floor(Date.now() / 1000);

    const hash = await toolkit.createClaimableBalance({
      from: sender.secret(),
      asset: 'native',
      amount: '25',
      claimants: [
        {
          destination: recipient.publicKey(),
          predicate: {
            type: 'and',
            predicates: [
              { type: 'not_before', unixTimestamp: now + 60 },
              {
                type: 'or',
                predicates: [
                  { type: 'before', unixTimestamp: now + 3600 },
                  { type: 'unconditional' },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(hash).toBe('claimable_tx_hash_001');
  });
});
