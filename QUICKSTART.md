# Luffa Fabric MVP 2 Quickstart

Luffa Fabric is the temporary public name for the LAEL Phase 1 MVP 2 codebase. Existing `LAEL_*` environment variables and REST API paths remain compatible.

Completed by **Luffa AI Research Lab**.

## 1. Install and verify

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

This workspace can also run with Node package scripts:

```bash
node --run lint
node --run typecheck
node --run test
node --run build
```

## 2. Configure environment

```bash
cp .env.example .env
```

For local adapter tests, the default `mock://` RPC fallbacks are enough. For real chain verification, set:

- `BASE_RPC_URL`
- `SEPOLIA_RPC_URL`
- `POLYGON_RPC_URL`
- `SOLANA_RPC_URL`
- `WALLETCONNECT_PROJECT_ID`
- `USDC_BASE_SEPOLIA`

## 3. Start the API

```bash
pnpm start
```

Default server:

```text
http://127.0.0.1:3000
```

## 4. Run the MVP 2 flow

1. `POST /v2/wallet/connect`
2. Sign the returned message in Coinbase Wallet, MetaMask, OKX Wallet, WalletConnect, Phantom, or Luffa Wallet.
3. `POST /v2/wallet/verify`
4. Register an agent with `POST /v1/agents/register`
5. Create a scoped policy with `POST /v1/policies`
6. Invoke `luffa.create_task` through `POST /v1/agent/invoke`
7. Trigger or record settlement with `POST /v2/settlement/transfer`
8. Verify a transaction with `GET /v2/settlement/tx/:txHash`
9. Submit feedback with `POST /v1/executions/:executionId/feedback`

## 5. Frontend demo

```bash
cd src/frontend
pnpm install
pnpm dev
```

The demo expects the Luffa Fabric API at `http://127.0.0.1:3000`.
