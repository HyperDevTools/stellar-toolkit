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

describe('withRetry', () => {
  const timeout = new NetworkTimeoutError('https://horizon-testnet.stellar.org');

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uses exponential delays up to the configured cap', async () => {
    const operation = jest.fn().mockResolvedValue('recovered');
    for (let failure = 0; failure < 4; failure += 1) {
      operation.mockRejectedValueOnce(timeout);
    }
    const result = withRetry(operation, 5, 100, 250);
    expect(operation).toHaveBeenCalledTimes(1);

    for (const [index, delay] of [100, 200, 250, 250].entries()) {
      await jest.advanceTimersByTimeAsync(delay - 1);
      expect(operation).toHaveBeenCalledTimes(index + 1);
      await jest.advanceTimersByTimeAsync(1);
      expect(operation).toHaveBeenCalledTimes(index + 2);
    }
    await expect(result).resolves.toBe('recovered');
  });

  it('passes through the final error at the attempt limit', async () => {
    const finalError = new NetworkConnectionError('Horizon');
    const operation = jest.fn().mockRejectedValueOnce(timeout).mockRejectedValueOnce(finalError);
    const result = expect(withRetry(operation, 2, 10)).rejects.toBe(finalError);
    await jest.runAllTimersAsync();
    await result;
    expect(operation).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('skips timers for non-retryable errors and zero delay', async () => {
    const invalid = new ValidationError('amount', 'Expected a positive amount');
    const operation = jest.fn().mockRejectedValueOnce(invalid);
    await expect(withRetry(operation)).rejects.toBe(invalid);

    operation.mockRejectedValueOnce(timeout).mockResolvedValueOnce('recovered');
    await expect(withRetry(operation, 2, 50, 0)).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    [0, 50, 100],
    [1.5, 50, 100],
    [Infinity, 50, 100],
    [3, -1, 100],
    [3, 50, 2_147_483_648],
  ])('rejects invalid settings %s, %s, %s', async (attempts, base, max) => {
    const operation = jest.fn();
    await expect(withRetry(operation, attempts, base, max)).rejects.toThrow(ValidationError);
    expect(operation).not.toHaveBeenCalled();
  });
});
