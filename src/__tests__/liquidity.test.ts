import { Account, Keypair } from 'stellar-sdk';
import { StellarToolkit } from '../index';

describe('StellarToolkit - Liquidity Pool Operations', () => {
  let toolkit: StellarToolkit;
  const usdc = {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  };

  beforeEach(() => {
    toolkit = new StellarToolkit({ network: 'testnet' });
    const server = (
      toolkit as unknown as {
        server: {
          loadAccount: jest.Mock;
          submitTransaction: jest.Mock;
          liquidityPools: jest.Mock;
        };
      }
    ).server;

    jest.spyOn(server, 'loadAccount').mockImplementation(async (pubKey: string) => {
      return new Account(pubKey, '400') as unknown as never;
    });
    jest
      .spyOn(server, 'submitTransaction')
      .mockResolvedValue({ hash: 'liquidity_tx_hash_777' } as unknown as never);
    server.liquidityPools = jest.fn().mockReturnValue({
      liquidityPoolId: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({
          id: 'dd7b1ab831c273310ddbec6f97870aa83c2fbd78ce22aded37ecbf4f3380fac7',
          fee_bp: 30,
          type: 'constant_product',
          total_trustlines: '42',
          total_shares: '1000.0000000',
          reserves: [
            { asset: 'native', amount: '2000.0000000' },
            {
              asset: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
              amount: '500.0000000',
            },
          ],
        }),
      }),
    });
  });

  it('test_deposit_liquidity', async () => {
    const user = Keypair.random();

    const hash = await toolkit.depositLiquidity({
      accountSecret: user.secret(),
      assetA: 'native',
      assetB: usdc,
      maxAmountA: '200',
      maxAmountB: '50',
      minPrice: '3.5',
      maxPrice: '4.5',
      spotPrice: 4.0,
    });

    expect(hash).toBe('liquidity_tx_hash_777');
  });

  it('test_withdraw_liquidity', async () => {
    const user = Keypair.random();

    const hash = await toolkit.withdrawLiquidity({
      accountSecret: user.secret(),
      assetA: 'native',
      assetB: usdc,
      sharesAmount: '100',
      minAmountA: '190',
      minAmountB: '45',
    });

    expect(hash).toBe('liquidity_tx_hash_777');
  });

  it('test_get_pool_info', async () => {
    const poolId = toolkit.getPoolId('native', usdc);
    const info = await toolkit.getPoolInfo(poolId);

    expect(info.feeBp).toBe(30);
    expect(info.reserves).toHaveLength(2);
    expect(info.totalShares).toBe('1000.0000000');
  });

  it('test_slippage_protection', async () => {
    const user = Keypair.random();

    await expect(
      toolkit.depositLiquidity({
        accountSecret: user.secret(),
        assetA: 'native',
        assetB: usdc,
        maxAmountA: '200',
        maxAmountB: '50',
        minPrice: '3.8',
        maxPrice: '4.2',
        spotPrice: 5.0,
      }),
    ).rejects.toThrow(/Slippage/i);
  });

  it('test_calculate_lp_amount', () => {
    const initialShares = toolkit.calculateLpAmount(100, 400);
    expect(initialShares).toBe('200.0000000');

    const proportionalShares = toolkit.calculateLpAmount(200, 50, 2000, 500, 1000);
    expect(proportionalShares).toBe('100.0000000');
  });
});
