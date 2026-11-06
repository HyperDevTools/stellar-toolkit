import { Keypair } from 'stellar-sdk';
import {
  AccountNotFoundError,
  ErrorCode,
  InsufficientBalanceError,
  NetworkConnectionError,
  NetworkTimeoutError,
  StellarToolkit,
  TransactionRejectedError,
  ValidationError,
  withRetry,
} from '../index';

describe('StellarToolkit - Structured Error System & Recovery', () => {
  let toolkit: StellarToolkit;

  beforeEach(() => {
    toolkit = new StellarToolkit({ network: 'testnet' });
  });

  it('test_account_not_found_error', async () => {
    const kp = Keypair.random();
    const server = (toolkit as unknown as { server: { loadAccount: jest.Mock } }).server;
    jest.spyOn(server, 'loadAccount').mockRejectedValueOnce({
      response: { status: 404 },
      message: 'Not Found',
    });

    await expect(toolkit.getAccount(kp.publicKey())).rejects.toThrow(AccountNotFoundError);

    try {
      jest.spyOn(server, 'loadAccount').mockRejectedValueOnce({
        response: { status: 404 },
      });
      await toolkit.getAccount(kp.publicKey());
    } catch (err) {
      const e = err as AccountNotFoundError;
      expect(e.code).toBe(ErrorCode.ACCOUNT_NOT_FOUND);
      expect(e.category).toBe('account');
      expect(e.retryable).toBe(false);
    }
  });

  it('test_insufficient_balance_error', async () => {
    const sender = Keypair.random();
    const recipient = Keypair.random();
    const server = (toolkit as unknown as { server: { loadAccount: jest.Mock } }).server;
    jest.spyOn(server, 'loadAccount').mockResolvedValueOnce({
      accountId: () => sender.publicKey(),
      sequenceNumber: () => '1',
      incrementSequenceNumber: () => undefined,
      balances: [{ asset_type: 'native', balance: '15.0000000' }],
    } as unknown as never);

    await expect(
      toolkit.sendPayment({
        from: sender.secret(),
        to: recipient.publicKey(),
        amount: '50',
        asset: 'native',
      }),
    ).rejects.toThrow(InsufficientBalanceError);
  });

  it('test_network_timeout_error', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new NetworkTimeoutError('https://horizon-testnet.stellar.org', 5000);
        }
        return 'recovered_ok';
      },
      3,
      5,
    );

    expect(result).toBe('recovered_ok');
    expect(attempts).toBe(2);
  });

  it('test_error_recovery_suggestions', () => {
    const errors = [
      new AccountNotFoundError('GABC'),
      new InsufficientBalanceError('XLM', '100', '10'),
      new NetworkTimeoutError('https://horizon-testnet.stellar.org'),
      new NetworkConnectionError('https://horizon-testnet.stellar.org'),
      new TransactionRejectedError('tx_bad_seq'),
      new ValidationError('amount', 'must be positive'),
    ];

    for (const err of errors) {
      expect(err.recoverySuggestion.length).toBeGreaterThan(10);
      expect(err.message).toContain('[Recovery:');
    }
  });

  it('test_error_code_uniqueness', () => {
    const codes = Object.values(ErrorCode);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});
