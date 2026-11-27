# Error Handling & Recovery Guide

`@hyperdevtools/stellar-toolkit` provides a structured error hierarchy (`ToolkitError`) with machine-readable `ErrorCode` values, categories, retryability flags, and actionable recovery suggestions.

## Error Hierarchy

| Class | Code | Category | Retryable |
| --- | --- | --- | --- |
| `AccountNotFoundError` | `ERR_ACCOUNT_NOT_FOUND` | `account` | `false` |
| `InsufficientBalanceError` | `ERR_INSUFFICIENT_BALANCE` | `account` | `false` |
| `NetworkTimeoutError` | `ERR_NETWORK_TIMEOUT` | `network` | `true` |
| `NetworkConnectionError` | `ERR_NETWORK_CONNECTION` | `network` | `true` |
| `TransactionRejectedError` | `ERR_TRANSACTION_REJECTED` | `transaction` | `false` |
| `ValidationError` | `ERR_VALIDATION_FAILED` | `validation` | `false` |

## Automatic Retry for Transient Network Errors

Use `withRetry` to automatically retry operations that fail with retryable errors (`ToolkitError` instances where `error.retryable === true`, such as `NetworkTimeoutError` and `NetworkConnectionError`). Non-retryable `ToolkitError` instances and standard `Error` values are rethrown immediately without waiting or retrying.

### Retry Contract & Exponential Backoff Schedule

- **Schedule**: After failed attempt `k` (`1 <= k < maxAttempts`), `withRetry` waits `min(maxDelayMs, MAX_TIMER_DELAY_MS, baseDelayMs * 2^(k - 1))` milliseconds (deterministic, jitter-free).
- **Defaults**: `maxAttempts = 3`, `baseDelayMs = 50`, `maxDelayMs = 30_000` (30 seconds).
- **Validation & overflow safety**:
  - `maxAttempts` must be a safe integer `>= 1` (`ValidationError` otherwise).
  - `baseDelayMs` and `maxDelayMs` must be finite numbers `>= 0`, with `maxDelayMs >= baseDelayMs` when explicitly supplied except that zero disables the delay (`ValidationError` otherwise).
  - Delays exceeding `MAX_TIMER_DELAY_MS` (`2_147_483_647` ms, Node.js `setTimeout` signed 32-bit ceiling) or large exponents are safely clamped so timers never overflow to `1ms` or `Infinity`.

```typescript
import { StellarToolkit, withRetry } from '@hyperdevtools/stellar-toolkit';

const toolkit = new StellarToolkit({ network: 'testnet' });

// Positional arguments: (operation, maxAttempts?, baseDelayMs?, maxDelayMs?)
const balances = await withRetry(() => toolkit.getBalances(publicKey), 4, 200, 2_000);

// Options object overload
const account = await withRetry(() => toolkit.getAccount(publicKey), {
  maxAttempts: 4,
  baseDelayMs: 200,
  maxDelayMs: 2_000,
});
```
