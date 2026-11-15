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

export const DEFAULT_MAX_RETRY_ATTEMPTS = 3;
export const DEFAULT_BASE_RETRY_DELAY_MS = 50;
export const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;
/** Maximum 32-bit signed integer timer delay supported by Node.js `setTimeout` (~24.8 days). */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Compute bounded deterministic exponential backoff delay for 1-indexed failed `attempt`:
 * `min(maxDelayMs, MAX_TIMER_DELAY_MS, baseDelayMs * 2^(attempt - 1))`.
 */
export function calculateRetryDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
): number {
  const ceilingMs = Math.min(maxDelayMs, MAX_TIMER_DELAY_MS);
  if (baseDelayMs === 0 || ceilingMs === 0) {
    return 0;
  }
  const boundedBase = Math.min(baseDelayMs, ceilingMs);
  const exponent = attempt - 1;
  if (exponent >= 53) {
    return ceilingMs;
  }
  const rawDelay = boundedBase * 2 ** exponent;
  if (!Number.isFinite(rawDelay) || rawDelay > ceilingMs) {
    return ceilingMs;
  }
  return rawDelay;
}

export async function withRetry<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T>;
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts?: number,
  baseDelayMs?: number,
  maxDelayMs?: number,
): Promise<T>;
export async function withRetry<T>(
  operation: () => Promise<T>,
  optionsOrMaxAttempts: number | RetryOptions = DEFAULT_MAX_RETRY_ATTEMPTS,
  baseDelayMsArg = DEFAULT_BASE_RETRY_DELAY_MS,
  maxDelayMsArg?: number,
): Promise<T> {
  if (typeof operation !== 'function') {
    throw new ValidationError('operation', 'Retry operation must be a function');
  }

  let maxAttempts: number;
  let baseDelayMs: number;
  let explicitMaxDelayMs: number | undefined;

  if (typeof optionsOrMaxAttempts === 'object' && optionsOrMaxAttempts !== null) {
    if (Array.isArray(optionsOrMaxAttempts)) {
      throw new ValidationError('options', 'Retry options must be a plain object');
    }
    maxAttempts = optionsOrMaxAttempts.maxAttempts ?? DEFAULT_MAX_RETRY_ATTEMPTS;
    baseDelayMs = optionsOrMaxAttempts.baseDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS;
    explicitMaxDelayMs = optionsOrMaxAttempts.maxDelayMs;
  } else {
    maxAttempts = optionsOrMaxAttempts;
    baseDelayMs = baseDelayMsArg;
    explicitMaxDelayMs = maxDelayMsArg;
  }

  if (typeof maxAttempts !== 'number' || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new ValidationError(
      'maxAttempts',
      'maxAttempts must be a safe integer greater than or equal to 1',
    );
  }

  if (typeof baseDelayMs !== 'number' || !Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new ValidationError('baseDelayMs', 'baseDelayMs must be a finite non-negative number');
  }

  if (explicitMaxDelayMs !== undefined) {
    if (
      typeof explicitMaxDelayMs !== 'number' ||
      !Number.isFinite(explicitMaxDelayMs) ||
      explicitMaxDelayMs < 0
    ) {
      throw new ValidationError('maxDelayMs', 'maxDelayMs must be a finite non-negative number');
    }
    if (explicitMaxDelayMs < baseDelayMs) {
      throw new ValidationError(
        'maxDelayMs',
        `maxDelayMs (${explicitMaxDelayMs}) must be greater than or equal to baseDelayMs (${baseDelayMs})`,
      );
    }
  }

  const resolvedMaxDelayMs =
    explicitMaxDelayMs !== undefined
      ? explicitMaxDelayMs
      : Math.max(DEFAULT_MAX_RETRY_DELAY_MS, Math.min(baseDelayMs, MAX_TIMER_DELAY_MS));

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isRetryable = error instanceof ToolkitError && error.retryable;
      if (!isRetryable || attempt >= maxAttempts) {
        throw error;
      }
      const delayMs = calculateRetryDelayMs(attempt, baseDelayMs, resolvedMaxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
