import { Keypair } from 'stellar-sdk';
import {
  AccountNotFoundError,
  calculateRetryDelayMs,
  ErrorCode,
  InsufficientBalanceError,
  MAX_TIMER_DELAY_MS,
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

  describe('withRetry bounded exponential backoff (#30)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    it('uses deterministic exponential backoff capped by maxDelayMs without wall-clock sleeps', async () => {
      jest.useFakeTimers();
      const recordedDelays: number[] = [];
      const realSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation(((
        handler: (...args: unknown[]) => void,
        timeout?: number,
        ...args: unknown[]
      ) => {
        recordedDelays.push(timeout ?? 0);
        return realSetTimeout(handler, timeout, ...args);
      }) as typeof setTimeout);

      let attempts = 0;
      const promise = withRetry(
        async () => {
          attempts += 1;
          if (attempts < 5) {
            throw new NetworkConnectionError('https://horizon-testnet.stellar.org', 'ECONNRESET');
          }
          return 'ok';
        },
        5,
        100,
        250,
      );

      // Schedule for attempts 1..4 with base=100, max=250: 100, 200, 250, 250
      await jest.advanceTimersByTimeAsync(100);
      expect(attempts).toBe(2);

      await jest.advanceTimersByTimeAsync(200);
      expect(attempts).toBe(3);

      await jest.advanceTimersByTimeAsync(250);
      expect(attempts).toBe(4);

      await jest.advanceTimersByTimeAsync(250);
      await expect(promise).resolves.toBe('ok');
      expect(attempts).toBe(5);
      expect(recordedDelays).toEqual([100, 200, 250, 250]);
    });

    it('supports the RetryOptions object overload and rethrows after exhausting maxAttempts', async () => {
      jest.useFakeTimers();
      const recordedDelays: number[] = [];
      const realSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation(((
        handler: (...args: unknown[]) => void,
        timeout?: number,
        ...args: unknown[]
      ) => {
        recordedDelays.push(timeout ?? 0);
        return realSetTimeout(handler, timeout, ...args);
      }) as typeof setTimeout);

      let attempts = 0;
      const promise = withRetry(
        async () => {
          attempts += 1;
          throw new NetworkTimeoutError('https://horizon-testnet.stellar.org', 3000);
        },
        { maxAttempts: 4, baseDelayMs: 25, maxDelayMs: 60 },
      );
      const assertion = expect(promise).rejects.toThrow(NetworkTimeoutError);

      await jest.advanceTimersByTimeAsync(25 + 50 + 60);
      await assertion;
      expect(attempts).toBe(4);
      expect(recordedDelays).toEqual([25, 50, 60]);
    });

    it('rethrows non-retryable ToolkitErrors and standard Errors immediately without retrying', async () => {
      jest.useFakeTimers();
      const timeoutSpy = jest.spyOn(global, 'setTimeout');

      let toolkitCalls = 0;
      await expect(
        withRetry(
          async () => {
            toolkitCalls += 1;
            throw new AccountNotFoundError('GABC');
          },
          5,
          100,
        ),
      ).rejects.toThrow(AccountNotFoundError);
      expect(toolkitCalls).toBe(1);

      let genericCalls = 0;
      await expect(
        withRetry(
          async () => {
            genericCalls += 1;
            throw new Error('programmer error');
          },
          5,
          100,
        ),
      ).rejects.toThrow('programmer error');
      expect(genericCalls).toBe(1);
      expect(timeoutSpy).not.toHaveBeenCalled();
    });

    it('rejects invalid attempt counts, negative or non-finite delays, and inverted delay bounds before calling operation', async () => {
      let called = false;
      const op = async () => {
        called = true;
        return 'never';
      };

      const invalidConfigs: Array<() => Promise<unknown>> = [
        () => withRetry(null as unknown as () => Promise<string>),
        () => withRetry(op, [] as unknown as never),
        () => withRetry(op, 0),
        () => withRetry(op, -2),
        () => withRetry(op, 1.5),
        () => withRetry(op, Number.NaN),
        () => withRetry(op, Number.POSITIVE_INFINITY),
        () => withRetry(op, 3, -1),
        () => withRetry(op, 3, Number.NaN),
        () => withRetry(op, 3, Number.POSITIVE_INFINITY),
        () => withRetry(op, 3, 50, -5),
        () => withRetry(op, 3, 50, Number.NaN),
        () => withRetry(op, 3, 50, Number.POSITIVE_INFINITY),
        () => withRetry(op, 3, 200, 100),
        () => withRetry(op, { maxAttempts: 0 }),
        () => withRetry(op, { baseDelayMs: -10 }),
        () => withRetry(op, { baseDelayMs: 500, maxDelayMs: 100 }),
      ];

      for (const invoke of invalidConfigs) {
        await expect(invoke()).rejects.toThrow(ValidationError);
      }
      expect(called).toBe(false);
    });

    it('safely bounds overflow-sized delays and zero delays without producing Infinity, NaN, or 32-bit timer overflow', async () => {
      expect(calculateRetryDelayMs(1, 0, 1000)).toBe(0);
      expect(calculateRetryDelayMs(200, 0, 1000)).toBe(0);
      expect(calculateRetryDelayMs(1, 100, 0)).toBe(0);
      expect(calculateRetryDelayMs(80, 100, 5_000)).toBe(5_000);
      expect(calculateRetryDelayMs(1200, 1e300, Number.MAX_VALUE)).toBe(MAX_TIMER_DELAY_MS);
      expect(calculateRetryDelayMs(1, MAX_TIMER_DELAY_MS * 4, Number.MAX_VALUE)).toBe(
        MAX_TIMER_DELAY_MS,
      );

      jest.useFakeTimers();
      const recordedDelays: number[] = [];
      const realSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation(((
        handler: (...args: unknown[]) => void,
        timeout?: number,
        ...args: unknown[]
      ) => {
        recordedDelays.push(timeout ?? 0);
        return realSetTimeout(handler, 0, ...args);
      }) as typeof setTimeout);

      let attempts = 0;
      const promise = withRetry(
        async () => {
          attempts += 1;
          if (attempts < 3) {
            throw new NetworkTimeoutError('https://horizon-testnet.stellar.org');
          }
          return 'bounded';
        },
        { maxAttempts: 3, baseDelayMs: MAX_TIMER_DELAY_MS * 2, maxDelayMs: Number.MAX_VALUE },
      );

      await jest.runAllTimersAsync();
      await expect(promise).resolves.toBe('bounded');
      expect(recordedDelays).toEqual([MAX_TIMER_DELAY_MS, MAX_TIMER_DELAY_MS]);
    });
  });
});

describe('withRetry', () => {
  const timeout = new NetworkTimeoutError('https://horizon-testnet.stellar.org');

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('skips timers for non-retryable errors and zero delay', async () => {
    const invalid = new ValidationError('amount', 'Expected a positive amount');
    const operation = jest.fn().mockRejectedValueOnce(invalid);
    await expect(withRetry(operation)).rejects.toBe(invalid);

    operation.mockRejectedValueOnce(timeout).mockResolvedValueOnce('recovered');
    await expect(withRetry(operation, 2, 50, 0)).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  });
});
