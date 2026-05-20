# Luffa Fabric

**Agent identity, delegated permission, wallet settlement, execution ledger, and reputation for the agentic economy.**

Luffa Fabric is a production-grade Phase 1 MVP for building wallet-connected AI agent systems. It lets developers register agents, bind user wallets to DIDs, issue scoped capability tokens, enforce spending and chain limits, execute permitted actions, settle through chain-specific adapters, and write every outcome into an auditable execution ledger.

Completed by **Luffa AI Research Lab**.

> Formerly referred to as **LAEL**. The compatibility class name `LAEL` and `LAEL_*` environment variables are intentionally preserved for Phase 1 callers.

## Why It Exists

AI agents are starting to act on behalf of users, teams, applications, and protocols. The hard part is not only calling tools. The hard part is proving:

- who the agent is
- who authorized it
- what it is allowed to do
- which wallet signed or delegated authority
- whether the action respected spending limits
- where settlement happened
- what transaction hash proves it
- how the result changes reputation

Luffa Fabric is the connector layer for that loop.

```text
Identity
  -> Wallet Binding
  -> Delegated Permission
  -> Execution
  -> Settlement Adapter
  -> Blockchain / Points Rail
  -> Ledger
  -> Feedback
  -> Reputation
```

It is not a marketplace, bridge, MPC wallet, account-abstraction stack, zkML runtime, TEE system, DAO, or full decentralized protocol. Those surfaces are deliberately reserved for future phases.

## What Is Included

| Layer | MVP 2 capability |
| --- | --- |
| Identity | DID-style owner references, agent registration, service keys, delegated capability tokens |
| Wallets | Wallet connect nonce flow, signature verification, DID-to-wallet binding |
| Permission | Default-deny policy engine with action, risk, budget, asset, chain, expiry, and revocation checks |
| Execution | Agent invocation pipeline with idempotency and denied-action recording |
| Settlement | Luffa Points, EVM native, EVM ERC20, Solana native, Solana SPL, Endless adapter abstraction |
| Ledger | Execution and settlement records with tx hash, wallet, chain, gas, block, Merkle leaf, and Merkle root |
| Reputation | Feedback submission and exponential moving average reputation scoring |
| API | Phase 1 v1 APIs preserved, MVP 2 wallet and settlement APIs added |
| Demo | Next.js wallet demo scaffold and visual demo flow |
| QA | Unit, integration, E2E, wallet, settlement, ledger, and security tests |

## Supported Wallets

- Coinbase Wallet
- MetaMask
- OKX Wallet
- WalletConnect v2
- Phantom
- Luffa Wallet

Luffa Fabric never stores user mnemonics, seed phrases, master private keys, or raw wallet private keys. Wallet ownership is external and is proven by signing a scoped wallet-binding message.

## Supported Chains

| Chain key | Type | Network |
| --- | --- | --- |
| `BASE_MAINNET` | EVM | Base Mainnet |
| `BASE_SEPOLIA` | EVM | Base Sepolia |
| `ETHEREUM_SEPOLIA` | EVM | Ethereum Sepolia |
| `POLYGON_AMOY` | EVM | Polygon Amoy |
| `SOLANA_DEVNET` | Solana | Solana Devnet |
| `ENDLESS_TESTNET` | Endless | Endless-compatible testnet adapter |

Configuration details live in [CHAIN_CONFIGURATION.md](./CHAIN_CONFIGURATION.md).

## Settlement Rails

Luffa Fabric keeps the core chain-agnostic. The execution engine emits `SettlementInstruction`; concrete chain behavior lives behind adapter interfaces.

```ts
export interface SettlementAdapter {
  chainType: string;
  getBalance(address: string): Promise<string>;
  transfer(input: SettlementTransferInput): Promise<SettlementTransferResult>;
  verifyTransaction(txHash: string): Promise<TransactionVerification>;
  estimateFee(input: SettlementTransferInput): Promise<string>;
}
```

Implemented rails:

- `luffa-points`
- `evm-native`
- `evm-erc20`
- `solana-native`
- `solana-spl`

The EVM, Solana, and Endless adapters can run in mock mode for CI and local development. Real testnet mode is designed to skip when RPC credentials or funded test wallets are unavailable.

## Delegated Permission Model

Agents can only execute scoped actions. A capability token may include:

- `maxAmount`
- `allowedAssets`
- `allowedChains`
- `expiresAt`
- revoked / active state

Every invocation follows the same path:

1. Resolve owner and agent identity.
2. Verify the agent is active and declares the requested capability.
3. Validate capability token scope, expiry, revocation, amount, asset, and chain.
4. Evaluate policy rules.
5. Record the permission decision.
6. Execute only after an explicit `ALLOW`.
7. Record the execution result, including denied actions.
8. If settlement occurs, store the settlement ID and tx hash.

Permission is default-deny. Deny rules override allow rules.

## Execution Ledger

Every invocation writes an execution record with reserved forward-compatible fields:

- `executionId`
- `agentId`
- `action`
- `params`
- `status`
- `permissionDecisionId`
- `settlementId`
- `chainType`
- `chainId`
- `txHash`
- `walletAddress`
- `gasUsed`
- `blockNumber`
- `merkleLeafHash`
- `merkleRoot`
- `rawInput`
- `feedback`
- `zkProof`
- `teeAttestation`

This creates an auditable MVP ledger while avoiding claims of full decentralized protocol security.

## REST API

Phase 1 APIs are preserved:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/agents/register` | Register an agent |
| `POST` | `/v1/policies` | Create a permission policy |
| `POST` | `/v1/agent/invoke` | Invoke an agent action |
| `GET` | `/v1/executions/:executionId` | Read execution record |
| `POST` | `/v1/executions/:executionId/feedback` | Submit feedback |
| `GET` | `/v1/agents/:agentId/reputation` | Read reputation |

MVP 2 APIs:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/v2/chains` | List chain registry |
| `POST` | `/v2/wallet/connect` | Create wallet-binding nonce |
| `POST` | `/v2/wallet/verify` | Verify signature and bind wallet |
| `GET` | `/v2/wallets/:ownerRef` | List owner wallet bindings |
| `POST` | `/v2/settlement/transfer` | Invoke settlement adapter |
| `GET` | `/v2/settlement/tx/:txHash` | Verify transaction status |

## Quick Start

```bash
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm demo
```

Create local configuration:

```bash
cp .env.example .env
```

Use mock settlement mode for local and CI runs:

```bash
LAEL_SETTLEMENT_MODE=mock pnpm test
```

Run the API after building:

```bash
pnpm build
pnpm start
```

## Demo

Run the scripted demo:

```bash
pnpm demo
```

Run the visual demo:

```bash
pnpm demo:visual
```

The intended MVP 2 demo flow:

1. Connect Coinbase Wallet or another supported wallet.
2. Sign a DID wallet-binding message.
3. Register an agent.
4. Create a scoped policy.
5. Invoke `luffa.create_task`.
6. Trigger a Base Sepolia USDC mock settlement.
7. Save and display `txHash`.
8. Verify the transaction.
9. Write the execution ledger record.
10. Submit feedback.
11. Update reputation.

## Frontend

The Next.js demo lives in [src/frontend](./src/frontend).

```bash
cd src/frontend
pnpm install
pnpm dev
```

The demo includes wallet connection, chain display, chain switching, address display, signature flow, agent registration, policy creation, invocation, settlement tx hash display, execution record display, error states, and reputation display.

## Test Suite

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:wallet
pnpm test:settlement
```

The suite covers:

- wallet nonce creation
- EVM signature verification
- Solana signature verification
- nonce replay and expiry rejection
- DID wallet binding
- duplicate binding rules
- chain registry validation
- settlement adapter conformance
- Luffa Points transfer and rollback
- EVM native and ERC20 mock settlement
- Solana SOL and SPL mock settlement
- permission denial
- capability expiry and revocation
- idempotent execution
- tx hash persistence
- execution ledger Merkle fields
- feedback and reputation updates
- security checks for mnemonic / seed phrase / private key storage

Latest local QA before publication:

- `pnpm test`: 74 tests passed
- `pnpm typecheck`: passed
- `pnpm build`: passed
- `pnpm demo`: passed

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
  mcp/          MCP server surface
  permission/   Default-deny policy evaluation
  settlement/   Luffa Points ledger and settlement adapters
  wallet/       Wallet nonce, signature verification, and DID binding
tests/
  e2e/          End-to-end MVP 2 flow
fixtures/       Deterministic wallet, agent, policy, and settlement fixtures
visual-demo/    Vite visual demo
```

## Configuration

See [.env.example](./.env.example) for all supported variables.

Important flags:

```bash
LAEL_SETTLEMENT_MODE=mock
ENABLE_EVM=true
ENABLE_SOLANA=true
ENABLE_ENDLESS=true
```

RPC and token configuration:

```bash
BASE_RPC_URL=
SEPOLIA_RPC_URL=
POLYGON_RPC_URL=
SOLANA_RPC_URL=
ENDLESS_RPC_URL=
WALLETCONNECT_PROJECT_ID=
USDC_BASE_SEPOLIA=
USDT_BASE_SEPOLIA=
```

## Security Boundaries

Luffa Fabric MVP 2 enforces:

- no mnemonic storage
- no seed phrase storage
- no raw user private key storage
- wallet binding through signature proof
- settlement only after permission approval
- spending caps
- chain and asset constraints
- capability expiry
- capability revocation
- idempotency keys
- tx hash recording
- denied-action ledger records

Security non-goals:

- no cross-chain bridge
- no MPC wallet
- no production account abstraction
- no zkML
- no TEE
- no DAO governance
- no production bridge security claims

## Documentation

- [QUICKSTART.md](./QUICKSTART.md)
- [WALLET_TEST_GUIDE.md](./WALLET_TEST_GUIDE.md)
- [CHAIN_CONFIGURATION.md](./CHAIN_CONFIGURATION.md)

## License

MIT.

## Stewardship

Built and maintained by **Luffa AI Research Lab** as part of the Luffa Super Connector ecosystem.
