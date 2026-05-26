# Luffa Fabric

**Agent identity, delegated permission, wallet settlement, trusted execution evidence, and reputation for the agentic economy.**

Luffa Fabric is the capability fabric for wallet-connected and context-bounded AI agents. It gives developers the primitives to register agents, bind user wallets to DIDs, issue scoped capability grants, enforce spending and chain limits, run trusted workflows, record execution evidence, settle through chain adapters, and turn feedback into reputation or learning-ready signals.

Built by **Luffa AI Research Lab**.

> Formerly referred to as **LAEL**. Compatibility names such as `LAEL` and `LAEL_*` are intentionally preserved for earlier callers.

## The Thesis

AI agents are beginning to act for users, teams, applications, communities, and protocols. The hard part is not only connecting them to tools. The hard part is proving:

- who the agent is
- who authorized it
- what it is allowed to do
- what context it may read
- which wallet or rail is allowed to settle
- whether risk and approval rules were enforced
- what evidence proves the outcome
- how feedback changes reputation and future learning

Luffa Fabric is the connector layer for that trust loop.

```text
Identity
  -> Wallet Binding
  -> Delegated Permission
  -> Context Boundary
  -> Trusted Execution
  -> Settlement Adapter
  -> Ledger / Receipt
  -> Feedback
  -> Reputation / Learning Signal
```

It is not a marketplace, bridge, MPC wallet, account-abstraction stack, zkML runtime, TEE system, DAO, or full decentralized protocol. Those surfaces are deliberately reserved for future phases.

## Architecture At A Glance

```mermaid
flowchart TD
  User["User / Community / App"]
  DID["DID + Agent Identity"]
  Capability["Delegated Capability / Policy"]
  Context["Context Boundary"]
  Runtime["Trusted Runtime"]
  Adapter["Execution / Settlement Adapter"]
  Ledger["Ledger + ExecutionReceipt"]
  Feedback["Feedback"]
  Reputation["Reputation / LearningSignal"]

  User --> DID
  DID --> Capability
  Capability --> Context
  Context --> Runtime
  Runtime --> Adapter
  Runtime --> Ledger
  Adapter --> Ledger
  Ledger --> Feedback
  Feedback --> Reputation
```

## What Is Included

| Layer | Capability |
| --- | --- |
| Identity | DID-style owner references, agent registration, service keys, delegated capability tokens |
| Wallets | Wallet connect nonce flow, signature verification, DID-to-wallet binding |
| Permission | Default-deny policy engine with action, risk, budget, asset, chain, expiry, and revocation checks |
| Context | MVP1 VARR context resources, namespace isolation, public-scope enforcement |
| Execution | Agent invocation pipeline plus trusted VARR runtime sidecar |
| Settlement | Luffa Points, EVM native, EVM ERC20, Solana native, Solana SPL, Endless adapter abstraction |
| Evidence | Execution ledger, settlement records, Merkle fields, and VARR `ExecutionReceipt` |
| Feedback | Feedback submission, reputation scoring, and learning-ready signal emission |
| API | Phase 1 v1 APIs, MVP 2 wallet and settlement APIs, VARR sidecar API |
| Demo | Wallet demo scaffold plus community summary trusted-agent demo |
| QA | Unit, integration, E2E, wallet, settlement, ledger, and security tests |

## VARR Trusted Agent Runtime

The newest addition is **VARR MVP1: Trusted Agent Execution Loop**, an overlay runtime under `varr-mvp1/`.

VARR proves the smallest structurally correct trusted-agent path:

```text
One Agent
-> One DID
-> One Capability
-> One Context Boundary
-> One Workflow
-> One Controlled Execution
-> One ExecutionReceipt
-> One Feedback Signal
-> Zero Private-Key Exposure
```

The runtime is intentionally small and strict:

- `RuntimeOrchestrator` is the only execution path.
- Adapters cannot execute without runtime authorization.
- Every path creates an `ExecutionReceipt`, including denied and pending approval paths.
- Critical actions are hard-denied before adapter execution.
- High-risk actions return `pending_approval`.
- Feedback must reference a valid receipt.
- Learning signals are emitted only from receipt plus feedback.
- Seed phrases, private keys, mnemonics, and raw wallet credentials are never accepted or stored.

VARR is not a replacement for Luffa Core. It is a sidecar runtime that can consume Luffa identity, community, wallet intent, and event abstractions without invasive core changes.

## Supported Wallets

- Coinbase Wallet
- MetaMask
- OKX Wallet
- WalletConnect v2
- Phantom
- Luffa Wallet

Luffa Fabric never stores user mnemonics, seed phrases, master private keys, or raw wallet private keys. Wallet ownership is external and is proven by signing scoped wallet-binding messages.

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
- revoked or active state

Every invocation follows the same trust path:

1. Resolve owner and agent identity.
2. Verify the agent is active and declares the requested capability.
3. Validate capability token scope, expiry, revocation, amount, asset, and chain.
4. Check context boundaries when context access is requested.
5. Evaluate policy and risk.
6. Route high-risk actions to approval.
7. Deny critical actions before adapter execution.
8. Execute only after explicit authorization.
9. Record the execution outcome, including denied actions.
10. If settlement occurs, store the settlement ID and transaction hash.

Permission is default-deny. Deny rules override allow rules.

## Evidence Model

Luffa Fabric records execution and settlement evidence. VARR adds an explicit receipt primitive for trusted runtime paths.

`ExecutionReceipt` captures:

- intent ID
- agent ID
- workflow ID
- capability IDs
- context references
- context hash
- policy decisions
- risk level
- approval requirement
- status
- output hash or pointer
- cost metadata
- creation timestamp

Receipts are append-only evidence records, not casual logs.

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

VARR sidecar APIs live under `varr-mvp1/packages/api`:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/agents` | Register an `AgentResource` |
| `POST` | `/v1/capabilities` | Create a `CapabilityGrant` |
| `POST` | `/v1/contexts` | Create a `ContextResource` |
| `POST` | `/v1/workflows` | Create a `WorkflowResource` |
| `POST` | `/v1/execution/run` | Run the trusted execution loop |
| `GET` | `/v1/execution/receipts/{receipt_id}` | Read an execution receipt |
| `POST` | `/v1/feedback` | Attach feedback to a receipt |
| `GET` | `/v1/learning/signals?receipt_id={receipt_id}` | Read learning-ready signals |

## Quick Start

Core Luffa Fabric:

```bash
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm demo
```

VARR sidecar:

```bash
cd varr-mvp1
pnpm test
pnpm demo
```

Expected VARR demo result:

```text
Execution status: success
Receipt generated: receipt_001
Feedback accepted: yes
Learning signal emitted: yes
Private key exposure: no
Context boundary respected: yes
```

## Demo Flows

Core MVP 2 flow:

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

VARR MVP1 flow:

1. Register the Community Summary Agent.
2. Grant public community read and summarize capabilities.
3. Create a public community context.
4. Create a linear workflow.
5. Execute through `RuntimeOrchestrator`.
6. Generate an `ExecutionReceipt`.
7. Submit feedback.
8. Emit a `LearningSignal`.

## Test Coverage

Core Luffa Fabric test commands:

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:wallet
pnpm test:settlement
```

VARR sidecar coverage includes:

- resource validators
- capability enforcement
- expired and revoked capability denial
- context namespace isolation
- private context denial in MVP1
- low-risk successful execution
- high-risk `pending_approval`
- critical action denial
- receipt creation for every runtime path
- feedback rejection without a valid receipt
- adapter bypass protection
- seed phrase and private key material rejection

Latest VARR local verification:

- `pnpm test`: 19 tests passed
- `pnpm demo`: passed end to end

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

varr-mvp1/
  packages/core     Trusted runtime, resources, storage, adapters, security
  packages/api      Minimal REST API
  packages/cli      Developer CLI
  packages/sdk-js   Lightweight JavaScript client
  examples/         Community summary agent demo
  docs/             Architecture, API, security, threat model
  tests/            Unit, integration, and security tests

tests/
  e2e/          End-to-end MVP 2 flow
fixtures/       Deterministic wallet, agent, policy, and settlement fixtures
visual-demo/    Vite visual demo
```

## Configuration

See [.env.example](./.env.example) for core Luffa Fabric variables.

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

Luffa Fabric enforces:

- no mnemonic storage
- no seed phrase storage
- no raw user private key storage
- wallet binding through signature proof
- capability-scoped execution
- context-bound runtime access
- settlement only after permission approval
- spending caps
- chain and asset constraints
- capability expiry
- capability revocation
- idempotency keys
- transaction hash recording
- denied-action evidence records
- approval gating for high-risk actions

Security non-goals:

- no cross-chain bridge
- no MPC wallet
- no production account abstraction
- no zkML
- no TEE
- no DAO governance
- no production bridge security claims
- no production sandbox cluster in VARR MVP1

## Documentation

- [QUICKSTART.md](./QUICKSTART.md)
- [WALLET_TEST_GUIDE.md](./WALLET_TEST_GUIDE.md)
- [CHAIN_CONFIGURATION.md](./CHAIN_CONFIGURATION.md)
- [VARR MVP1 Architecture](./varr-mvp1/docs/architecture.md)
- [VARR MVP1 Security](./varr-mvp1/docs/security.md)
- [VARR MVP1 Threat Model](./varr-mvp1/docs/threat-model.md)

## Phase 2 Core API Deployment

Phase 2 uses this repository as the **Luffa Fabric Core API**. The Vercel interactive demo remains a static frontend; this API should be deployed separately, for example on Railway.

Required public demo shape:

```text
Vercel demo
-> Railway Luffa Core API
-> wallet binding
-> agent registration
-> policy creation
-> invoke
-> mock settlement / Luffa Points
-> feedback
-> reputation
```

### Railway Settings

Railway can deploy this repo from GitHub using the included `railway.json`.

```text
Build Command: pnpm install --frozen-lockfile && pnpm build
Start Command: pnpm start
Healthcheck Path: /health
```

Recommended Railway environment variables:

```text
NODE_ENV=production
LAEL_HOST=0.0.0.0
LAEL_DB_PATH=./data/lael.db
LAEL_CORS_ORIGINS=https://luffa-fabric-interactive-demo.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

Railway provides `PORT`; the server uses `PORT` first, then `LAEL_PORT`, then `3000`.

### Health Check

```bash
curl https://your-railway-core-api.up.railway.app/health
```

Expected response:

```json
{
  "ok": true,
  "service": "luffa-fabric-core-api"
}
```

### CORS

Browser callers must be explicitly allowed through `LAEL_CORS_ORIGINS`.

For production Vercel:

```text
https://luffa-fabric-interactive-demo.vercel.app
```

For local Vite:

```text
http://localhost:5173,http://127.0.0.1:5173
```

### Phase 2 Flow

The Vercel demo should call these existing routes:

```text
POST /v2/wallet/connect
POST /v2/wallet/verify
POST /v1/agents/register
POST /v1/policies
POST /v1/agent/invoke
POST /v2/settlement/transfer
GET  /v1/executions/:executionId
POST /v1/executions/:executionId/feedback
GET  /v1/agents/:agentId/reputation
```

Use `did:pkh:eip155:84532:<wallet_address>` as the Base Sepolia owner reference for browser wallet demos. Use `LUFFA_POINTS` and `luffa-points` for safe mock settlement. Do not require real money movement, user private keys, seed phrases, or mnemonics.

### Phase 3 Roadmap

Deploy the VARR sidecar separately and add VARR Mode to the frontend. Only VARR-generated evidence should be labeled `ExecutionReceipt`. Phase 3 should create VARR resources, run the trusted execution loop, read `ExecutionReceipt`, submit feedback, emit `LearningSignal`, and optionally anchor a receipt hash to Base Sepolia using EAS.

## License

MIT.

## Stewardship

Built and maintained by **Luffa AI Research Lab** as part of the Luffa Super Connector ecosystem.
