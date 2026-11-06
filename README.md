# Stellar Toolkit 🌟

[![CI Status](https://github.com/HyperDevTools/stellar-toolkit/workflows/CI/badge.svg)](https://github.com/HyperDevTools/stellar-toolkit/actions)
[![Version](https://img.shields.io/github/v/release/HyperDevTools/stellar-toolkit)](https://github.com/HyperDevTools/stellar-toolkit/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A comprehensive TypeScript/JavaScript utility library that simplifies common Stellar blockchain operations. Built for developers who want clean, tested, and production-ready helpers for Stellar development.

**Documentation site:** [Stellar Toolkit guide](https://hyperdevtools.github.io/stellar-toolkit/)

**Current Version:** v0.1.0

## 🎯 Overview

Stellar Toolkit provides high-level abstractions over the Stellar SDK, making it easier to:
- Create and manage accounts
- Send payments and handle assets
- Interact with the Stellar network
- Parse and format Stellar data
- Handle common error scenarios gracefully

## 🚀 Features

- **Account Management**: Simplified account creation, funding, and balance checking
- **Payment Operations**: Easy-to-use payment and path payment functions
- **Asset Utilities**: Create, manage, and query custom assets
- **Network Helpers**: Automatic network detection and configuration
- **Error Handling**: Comprehensive error handling with meaningful messages
- **Type-Safe**: Full TypeScript support with detailed type definitions
- **Well Tested**: Comprehensive test suite with example tests
- **CI/CD**: Automated testing and linting on every commit

## 📦 Installation

```bash
npm install @hyperdevtools/stellar-toolkit
# or
yarn add @hyperdevtools/stellar-toolkit
# or
pnpm add @hyperdevtools/stellar-toolkit
```

## 🔧 Quick Start

```typescript
import { StellarToolkit } from '@hyperdevtools/stellar-toolkit';

// Initialize the toolkit
const toolkit = new StellarToolkit({
  network: 'testnet', // or 'mainnet'
});

// Create a new account
const keypair = toolkit.generateKeypair();
console.log('New account:', keypair.publicKey);

// Send a payment
await toolkit.sendPayment({
  from: sourceSecret,
  to: destinationPublicKey,
  amount: '10',
  asset: 'native',
});
```

## 📚 Documentation

### Account Operations

```typescript
// Create a new keypair
const keypair = toolkit.generateKeypair();

// Get account details
const account = await toolkit.getAccount(publicKey);

// Get account balances
const balances = await toolkit.getBalances(publicKey);

// Fund a testnet account
await toolkit.fundTestnetAccount(publicKey);
```

### Payment Operations

```typescript
// Simple payment
await toolkit.sendPayment({
  from: sourceSecret,
  to: destinationPublicKey,
  amount: '100',
  asset: 'native',
  memo: 'Payment for services',
});

// Custom asset payment
await toolkit.sendPayment({
  from: sourceSecret,
  to: destinationPublicKey,
  amount: '50',
  asset: {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },
});

// Path payment
await toolkit.sendPathPayment({
  from: sourceSecret,
  to: destinationPublicKey,
  sendAsset: 'native',
  destAsset: { code: 'USDC', issuer: '...' },
  destAmount: '100',
  maxSend: '110',
});
```

### Asset Operations

```typescript
// Create a custom asset
const asset = toolkit.createAsset('MYTOKEN', issuerPublicKey);

// Establish trustline
await toolkit.addTrustline({
  account: accountSecret,
  asset: {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },
  limit: '10000',
});
```

## 🧪 Development

### Build Scripts

```bash
# Build the project
./scripts/build.sh

# Run tests
./scripts/test.sh

# Run linter
./scripts/lint.sh
```

Or using npm:

```bash
npm test          # Run test suite
npm run build     # Build for production
npm run lint      # Check code style
```

### Testing

The project includes a comprehensive test suite:

```bash
npm test                  # Run all tests
npm test -- --watch       # Run tests in watch mode
npm test -- --coverage    # Run with coverage report
```

## 🤝 Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for details.

**Good First Issues:** Check out issues labeled [`good-first-issue`](https://github.com/HyperDevTools/stellar-toolkit/labels/good-first-issue)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/HyperDevTools/stellar-toolkit.git
cd stellar-toolkit

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build
```

### CI/CD

All pull requests are automatically tested with:
- ✅ Unit tests (Jest)
- ✅ ESLint checks
- ✅ TypeScript compilation
- ✅ Code formatting (Prettier)
- ✅ Multi-version testing (Node 18.x, 20.x)

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for details.

## 📋 Roadmap

See [CHANGELOG.md](CHANGELOG.md) for version history.

**Planned Features:**
- [ ] Multi-signature account support
- [ ] Path payment strict send operations
- [ ] Claimable balance helpers
- [ ] Liquidity pool operations
- [ ] DEX trading utilities
- [ ] Fee bump transaction helpers
- [ ] Batch operation support
- [ ] Enhanced error recovery

## 📚 API Documentation

Detailed API documentation available in [`docs/api/`](docs/api/):
- [Account Manager API](docs/api/account-manager.md)
- Payment Manager API *(coming soon)*
- Trustline Manager API *(coming soon)*

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🙏 Acknowledgments

Built with:
- [Stellar SDK](https://github.com/stellar/js-stellar-sdk)
- TypeScript
- The amazing Stellar community

## 🔗 Links

- **[Release Notes](https://github.com/HyperDevTools/stellar-toolkit/releases)** - v0.1.0
- **[API Documentation](docs/api/)** - Complete API reference
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute
- **[Changelog](CHANGELOG.md)** - Version history
- **[Issue Templates](.github/ISSUE_TEMPLATE/)** - Report bugs or request features
- [Stellar Developers](https://developers.stellar.org/) - Official Stellar docs
- [Stellar Quest](https://quest.stellar.org/) - Learn Stellar development

## 💬 Support

- **Issues:** [Report bugs or request features](https://github.com/HyperDevTools/stellar-toolkit/issues)
- **Discussions:** Join community discussions on GitHub
- **Contributing:** See [CONTRIBUTING.md](CONTRIBUTING.md)

## 🌟 Show Your Support

If you find this project useful, please:
- ⭐ Star the repository
- 🐛 Report bugs and suggest features
- 🤝 Contribute code or documentation
- 📢 Share with other developers

---

**Part of the [HyperDevTools](https://github.com/HyperDevTools) organization** • Building developer tools for the Stellar ecosystem
