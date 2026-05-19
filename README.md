# Luffa Fabric

**Luffa Fabric** is the Phase 1 MVP 2 implementation of the multi-chain agent execution and settlement capability layer formerly referred to as LAEL.

Completed by **Luffa AI Research Lab**.

`@luffa/fabric` is a developer-facing capability layer where AI agents can be identified, permissioned, invoked, settled, audited, and scored across wallet-connected settlement rails.

Luffa Fabric MVP 2 is not a full decentralized protocol, marketplace, account-abstraction stack, bridge, MPC wallet, zkML system, TEE runtime, or DAO. It is the connector layer that proves a real closed loop:

```text
Identity -> Wallet Binding -> Permission -> Execution -> Settlement Adapter -> Blockchain -> Ledger -> Learning
```

## What Is Implemented

| Area | MVP 2 status |
| --- | --- |
| Agent identity registry | Implemented |
| Delegated capability tokens | Implemented with expiry, scope, max amount, allowed asset, and allowed chain checks |
| Default-deny permission layer | Implemented with budgets, risk, asset, and chain constraints |
| Wallet binding | Implemented with nonce, signature verification, and DID-to-wallet records |
| Chain registry | Implemented for Base, Sepolia, Polygon Amoy, Solana Devnet, and Endless testnet |
| Settlement adapters | Implemented for EVM, Solana, and Endless abstraction |
| Luffa Points ledger | Implemented with atomic rollback |
| Chain settlement records | Implemented with tx hash, chain, gas, block, and wallet fields |
| Execution ledger | Implemented with Merkle leaves and roots |
| Reputation | Implemented with feedback and EMA scoring |
| REST API | v1 preserved, v2 wallet and settlement APIs added |
| Frontend demo | Next.js scaffold under `src/frontend` |

## Wallet Support

Supported wallet types:

- Coinbase Wallet
- OKX Wallet
- MetaMask
- WalletConnect v2
- Phantom
- Luffa Wallet

Luffa Fabric never stores mnemonics, seed phrases, or master private keys. Wallet ownership is proven externally by signing a Luffa Fabric nonce message.

## Supported Chains

- `BASE_MAINNET`
- `BASE_SEPOLIA`
- `ETHEREUM_SEPOLIA`
- `POLYGON_AMOY`
- `SOLANA_DEVNET`
- `ENDLESS_TESTNET`

See [CHAIN_CONFIGURATION.md](./CHAIN_CONFIGURATION.md).

## Settlement Rails

- `luffa-points`
- `evm-native`
- `evm-erc20`
- `solana-native`
- `solana-spl`

The core only emits `SettlementInstruction`. EVM, Solana, and Endless details are isolated behind settlement adapters. The `LAEL` class name and `LAEL_*` environment variables are retained as compatibility surfaces for Phase 1 callers.

## Delegated Permission

Every invocation is checked before execution:

1. Resolve agent identity.
2. Check active status and declared capabilities.
3. Validate capability token scope and expiry when supplied.
4. Enforce token constraints: `maxAmount`, `allowedAssets`, `allowedChains`.
5. Evaluate policy rules: allowed actions, denied actions, budgets, risk, assets, and chains.
6. Execute only after an `ALLOW` decision.

Permission is default-deny. Deny rules override allow rules.

## Execution Ledger

Each invocation writes an execution record containing:

- action and params
- permission decision ID
- settlement ID
- optional chain type, chain ID, tx hash, wallet address, gas used, and block number
- status
- Merkle leaf hash and current Merkle root
- optional feedback

This gives the MVP an auditable execution trail without claiming full decentralized protocol security.

## REST API

Existing v1 endpoints remain available:

- `POST /v1/agents/register`
- `POST /v1/policies`
- `POST /v1/agent/invoke`
- `GET /v1/executions/:executionId`
- `POST /v1/executions/:executionId/feedback`
- `GET /v1/agents/:agentId/reputation`

MVP 2 endpoints:

- `GET /v2/chains`
- `POST /v2/wallet/connect`
- `POST /v2/wallet/verify`
- `GET /v2/wallets/:ownerRef`
- `POST /v2/settlement/transfer`
- `GET /v2/settlement/tx/:txHash`

## Quick Start

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

In this workspace, the verified commands were:

```bash
node --run lint
node --run typecheck
node --run test
node --run build
node --run demo
```

Observed result after MVP 2 QA:

- 74 tests passed.
- TypeScript strict build passed.
- Demo flow passed.
- Visual demo server started successfully.

## Frontend Demo

```bash
cd src/frontend
pnpm install
pnpm dev
```

The frontend includes EVM wallet connection with RainbowKit and wagmi, Phantom connection through Solana wallet adapter, chain switching, wallet binding, agent invocation, settlement recording, tx hash display, execution records, and reputation feedback.

## Repository Layout

```text
src/
  api/          Fastify REST API
  chains/       Chain registry and chain config types
  core/         Compatibility orchestrator
  db/           SQLite migrations and database wrapper
  execution/    Action handlers and Merkle execution ledger
  frontend/     Next.js MVP 2 wallet demo
  identity/     Agents, service keys, delegated capability tokens
  learning/     Feedback and reputation
  permission/   Default-deny policy evaluation
  settlement/   Luffa Points ledger and settlement adapters
  wallet/       Wallet connect nonce and signature binding
```

## Documentation

- [QUICKSTART.md](./QUICKSTART.md)
- [WALLET_TEST_GUIDE.md](./WALLET_TEST_GUIDE.md)
- [CHAIN_CONFIGURATION.md](./CHAIN_CONFIGURATION.md)

## Explicit Non-Goals

MVP 2 does not implement cross-chain bridging, full account abstraction, MPC custody, zkML, TEE execution, DAO governance, full A2A orchestration, or production bridge security. Reserved interfaces remain in place for future phases.
