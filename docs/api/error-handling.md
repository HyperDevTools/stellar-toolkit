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

Use `withRetry(operation, maxAttempts = 3, baseDelayMs = 50, maxDelayMs = 30000)` for read operations such as loading balances. The first attempt runs immediately and counts toward `maxAttempts`. A retryable error triggers a delay that doubles on each retry, starting at `baseDelayMs` and capped at `maxDelayMs`. A zero base or maximum disables the delay. Non-retryable errors and the final failed attempt are rethrown immediately.

Attempts must be a positive safe integer. Delays must be integer milliseconds from 0 to 2,147,483,647. Invalid options reject with `ValidationError` before the operation runs.

```typescript
import { StellarToolkit, withRetry } from '@hyperdevtools/stellar-toolkit';

const toolkit = new StellarToolkit({ network: 'testnet' });

const balances = await withRetry(() => toolkit.getBalances(publicKey), 4, 200, 500);
```
