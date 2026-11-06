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

  it.each([NaN, Infinity, 0, -1])('rejects invalid amountA %p', (amountA) => {
    expect(() => toolkit.calculateLpAmount(amountA, 10)).toThrow('amountA');
  });

  it.each([NaN, Infinity, 0, -1])('rejects invalid amountB %p', (amountB) => {
    expect(() => toolkit.calculateLpAmount(10, amountB)).toThrow('amountB');
  });

  it.each([
    { field: 'reserveA', reserveA: 0, reserveB: 10, totalShares: 100 },
    { field: 'reserveA', reserveA: NaN, reserveB: 10, totalShares: 100 },
    { field: 'reserveB', reserveA: 10, reserveB: Infinity, totalShares: 100 },
    { field: 'totalShares', reserveA: 10, reserveB: 10, totalShares: 0 },
    { field: 'totalShares', reserveA: 10, reserveB: 10, totalShares: NaN },
  ])('rejects invalid $field', ({ field, reserveA, reserveB, totalShares }) => {
    expect(() => toolkit.calculateLpAmount(1, 1, reserveA, reserveB, totalShares)).toThrow(field);
  });

  it('rejects incomplete optional reserve inputs', () => {
    expect(() => toolkit.calculateLpAmount(1, 1, 10)).toThrow(
      'reserveA, reserveB, and totalShares',
    );
  });

  it.each([
    { field: 'maxAmountA', maxAmountA: 'NaN', maxAmountB: '1' },
    { field: 'maxAmountA', maxAmountA: '0', maxAmountB: '1' },
    { field: 'maxAmountB', maxAmountA: '1', maxAmountB: 'Infinity' },
  ])('rejects invalid $field without submitting', async ({ field, maxAmountA, maxAmountB }) => {
    const user = Keypair.random();
    const server = (toolkit as unknown as { server: { submitTransaction: jest.Mock } }).server;

    await expect(
      toolkit.depositLiquidity({
        accountSecret: user.secret(),
        assetA: 'native',
        assetB: usdc,
        maxAmountA,
        maxAmountB,
        minPrice: '3.5',
        maxPrice: '4.5',
      }),
    ).rejects.toThrow(field);
    expect(server.submitTransaction).not.toHaveBeenCalled();
  });

  it.each([
    { field: 'spotPrice', spotPrice: NaN, minPrice: '3.5', maxPrice: '4.5' },
    { field: 'spotPrice', spotPrice: Infinity, minPrice: '3.5', maxPrice: '4.5' },
    { field: 'minPrice', spotPrice: 4, minPrice: 'NaN', maxPrice: '4.5' },
    { field: 'maxPrice', spotPrice: 4, minPrice: '3.5', maxPrice: 'Infinity' },
    { field: 'minPrice', spotPrice: 4, minPrice: '5', maxPrice: '4.5' },
  ])(
    'rejects invalid $field without submitting',
    async ({ field, spotPrice, minPrice, maxPrice }) => {
      const user = Keypair.random();
      const server = (toolkit as unknown as { server: { submitTransaction: jest.Mock } }).server;

      await expect(
        toolkit.depositLiquidity({
          accountSecret: user.secret(),
          assetA: 'native',
          assetB: usdc,
          maxAmountA: '200',
          maxAmountB: '50',
          minPrice,
          maxPrice,
          spotPrice,
        }),
      ).rejects.toThrow(field);
      expect(server.submitTransaction).not.toHaveBeenCalled();
    },
  );
});
