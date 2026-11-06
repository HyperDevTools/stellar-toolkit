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

Use `withRetry` to automatically retry operations that fail with retryable errors (`NetworkTimeoutError`, `NetworkConnectionError`):

```typescript
import { StellarToolkit, withRetry } from '@hyperdevtools/stellar-toolkit';

const toolkit = new StellarToolkit({ network: 'testnet' });

const balances = await withRetry(() => toolkit.getBalances(publicKey), 3, 200);
```
