# AccountManager API Reference

The `AccountManager` class provides utilities for managing Stellar accounts.

## Methods

### `generateKeypair()`

Generate a new random Stellar keypair.

**Signature:**
```typescript
generateKeypair(): AccountInfo
```

**Returns:**
```typescript
{
  publicKey: string;  // Stellar public key (G...)
  secret: string;     // Stellar secret key (S...)
}
```

**Example:**
```typescript
const toolkit = new StellarToolkit({ network: 'testnet' });
const keypair = toolkit.generateKeypair();

console.log('Public Key:', keypair.publicKey);
console.log('Secret Key:', keypair.secret);
```

---

### `loadAccount(publicKey)`

Load account information from the Stellar network.

**Signature:**
```typescript
async loadAccount(publicKey: string): Promise<Account>
```

**Parameters:**
- `publicKey` (string): The public key of the account to load

**Returns:** Stellar SDK `Account` object

**Throws:**
- `Error` if account does not exist or network request fails

**Example:**
```typescript
try {
  const account = await toolkit.getAccount('GXXXXXXX...');
  console.log('Sequence:', account.sequence);
} catch (error) {
  console.error('Account not found:', error.message);
}
```

---

### `getBalances(publicKey)`

Get all asset balances for an account.

**Signature:**
```typescript
async getBalances(publicKey: string): Promise<Balance[]>
```

**Parameters:**
- `publicKey` (string): The public key of the account

**Returns:** Array of Balance objects
```typescript
{
  asset_type: string;      // "native" or "credit_alphanum4" or "credit_alphanum12"
  asset_code?: string;     // Asset code (e.g., "USDC")
  asset_issuer?: string;   // Asset issuer public key
  balance: string;         // Balance amount as string
  limit?: string;          // Trustline limit (for non-native assets)
}[]
```

**Example:**
```typescript
const balances = await toolkit.getBalances('GXXXXXXX...');

balances.forEach(balance => {
  if (balance.asset_type === 'native') {
    console.log(`XLM: ${balance.balance}`);
  } else {
    console.log(`${balance.asset_code}: ${balance.balance}`);
  }
});
```

---

### `accountExists(publicKey)`

Check if an account exists on the network.

**Signature:**
```typescript
async accountExists(publicKey: string): Promise<boolean>
```

**Parameters:**
- `publicKey` (string): The public key to check

**Returns:** `true` for a successful lookup and `false` for a confirmed Horizon 404. Timeouts and other lookup failures reject with a typed network error.

**Example:**
```typescript
const exists = await toolkit.accountExists('GXXXXXXX...');

if (exists) {
  console.log('Account exists');
} else {
  console.log('Account not found - needs funding');
}
```

---

### `getNativeBalance(publicKey)`

Get the native XLM balance for an account.

**Signature:**
```typescript
async getNativeBalance(publicKey: string): Promise<string>
```

**Parameters:**
- `publicKey` (string): The public key of the account

**Returns:** Balance as string (e.g., "100.5000000")

**Example:**
```typescript
const xlmBalance = await toolkit.getNativeBalance('GXXXXXXX...');
console.log(`XLM Balance: ${xlmBalance}`);
```

---

### `fundTestnetAccount(publicKey)`

Fund an account on testnet using Friendbot.

**Signature:**
```typescript
async fundTestnetAccount(publicKey: string): Promise<void>
```

**Parameters:**
- `publicKey` (string): The public key to fund

**Throws:**
- `Error` if the request fails (network down, invalid key, etc.)

A mainnet client or an invalid account public key fails validation before an HTTP request is sent. Never pass a secret key to Friendbot.

**Example:**
```typescript
const keypair = toolkit.generateKeypair();

// Fund on testnet
await toolkit.fundTestnetAccount(keypair.publicKey);

// Check balance
const balance = await toolkit.getNativeBalance(keypair.publicKey);
console.log(`Funded with ${balance} XLM`);
```

---

## Signing with multiple signers

`signMultiSigTransaction` accepts an integer threshold from 1 to 255. Without a weight map, each distinct signer counts for one. With an explicit map, only listed weights count, and each weight is an integer from 0 to 255. The helper validates the total before adding signatures to the supplied transaction.

## Error Handling

All async methods can throw errors. Common error scenarios:

| Error | Cause | Solution |
|-------|-------|----------|
| "Account not found" | Account doesn't exist on network | Fund the account first (testnet) or verify address |
| "Failed to load account" | Network issue or invalid key | Check network connectivity and key format |
| "Friendbot request failed" | Testnet issue or mainnet usage | Verify using testnet network |

**Example Error Handling:**
```typescript
try {
  const account = await toolkit.getAccount(publicKey);
  // Use account
} catch (error) {
  if (error.message.includes('Account not found')) {
    console.log('Account needs funding');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

---

## Type Definitions

```typescript
interface AccountInfo {
  publicKey: string;
  secret?: string;
}

interface Balance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
}
```

---

## See Also

- [Payment Manager API](./payment-manager.md)
- [Trustline Manager API](./trustline-manager.md)
- [Stellar Account Documentation](https://developers.stellar.org/docs/encyclopedia/accounts)
