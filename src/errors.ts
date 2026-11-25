import { ErrorCategory, ErrorCode } from './types';

export interface ErrorMetadata {
  code: ErrorCode;
  category: ErrorCategory;
  recoverySuggestion: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export class ToolkitError extends Error {
  public readonly code: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly recoverySuggestion: string;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, metadata: ErrorMetadata) {
    super(`${message} [Recovery: ${metadata.recoverySuggestion}]`);
    this.name = new.target.name;
    this.code = metadata.code;
    this.category = metadata.category;
    this.recoverySuggestion = metadata.recoverySuggestion;
    this.retryable = metadata.retryable;
    this.details = metadata.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AccountNotFoundError extends ToolkitError {
  constructor(publicKey: string) {
    super(`Account ${publicKey} was not found on the Stellar network.`, {
      code: ErrorCode.ACCOUNT_NOT_FOUND,
      category: 'account',
      recoverySuggestion:
        'Fund the account with at least the minimum XLM reserve (or use fundTestnetAccount on testnet) before querying or transacting.',
      retryable: false,
      details: { publicKey },
    });
  }
}

export class InsufficientBalanceError extends ToolkitError {
  constructor(asset: string, requiredAmount: string, availableBalance: string) {
    super(
      `Insufficient ${asset} balance: required ${requiredAmount}, available ${availableBalance}.`,
      {
        code: ErrorCode.INSUFFICIENT_BALANCE,
        category: 'account',
        recoverySuggestion: `Deposit additional ${asset} or reduce the transaction amount below ${availableBalance}.`,
        retryable: false,
        details: { asset, requiredAmount, availableBalance },
      },
    );
  }
}

export class NetworkTimeoutError extends ToolkitError {
  constructor(endpoint: string, timeoutMs?: number) {
    super(`Network request to ${endpoint} timed out.`, {
      code: ErrorCode.NETWORK_TIMEOUT,
      category: 'network',
      recoverySuggestion:
        'Retry the operation with exponential backoff or switch to a healthier Horizon RPC endpoint.',
      retryable: true,
      details: { endpoint, timeoutMs },
    });
  }
}

export class NetworkConnectionError extends ToolkitError {
  constructor(endpoint: string, causeMessage?: string) {
    super(`Failed to connect to Horizon endpoint ${endpoint}: ${causeMessage || 'unreachable'}.`, {
      code: ErrorCode.NETWORK_CONNECTION,
      category: 'network',
      recoverySuggestion:
        'Verify network connectivity and confirm the Horizon URL matches the configured Stellar network.',
      retryable: true,
      details: { endpoint, causeMessage },
    });
  }
}

export class TransactionRejectedError extends ToolkitError {
  constructor(reason: string, resultCodes?: Record<string, unknown>) {
    super(`Transaction rejected by network: ${reason}.`, {
      code: ErrorCode.TRANSACTION_REJECTED,
      category: 'transaction',
      recoverySuggestion:
        'Inspect the Stellar transaction result codes, verify sequence numbers and signatures, and resubmit.',
      retryable: false,
      details: { reason, resultCodes },
    });
  }
}

export class ValidationError extends ToolkitError {
  constructor(field: string, reason: string) {
    super(`Validation error on '${field}': ${reason}.`, {
      code: ErrorCode.VALIDATION_FAILED,
      category: 'validation',
      recoverySuggestion: `Provide a valid value for '${field}' (${reason}).`,
      retryable: false,
      details: { field, reason },
    });
  }
}

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 50,
  maxDelayMs = 30_000,
): Promise<T> {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new ValidationError('maxAttempts', 'Expected a positive safe integer');
  }
  for (const [field, delay] of Object.entries({ baseDelayMs, maxDelayMs })) {
    if (!Number.isInteger(delay) || delay < 0 || delay > MAX_TIMER_DELAY_MS) {
      throw new ValidationError(field, `Expected an integer from 0 to ${MAX_TIMER_DELAY_MS}`);
    }
  }

  let delayMs = Math.min(baseDelayMs, maxDelayMs);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isRetryable = error instanceof ToolkitError && error.retryable;
      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * 2, maxDelayMs);
      }
    }
  }
}
