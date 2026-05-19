# Luffa Fabric MVP 2 Chain Configuration

Luffa Fabric core remains chain agnostic. Chain-specific behavior lives behind settlement adapters.

Completed by **Luffa AI Research Lab**.

## Required chain registry entries

| Key | Type | Chain ID | Env RPC |
| --- | --- | --- | --- |
| `BASE_SEPOLIA` | `evm` | `84532` | `BASE_RPC_URL` |
| `BASE_MAINNET` | `evm` | `8453` | `BASE_MAINNET_RPC_URL` or `BASE_RPC_URL` |
| `ETHEREUM_SEPOLIA` | `evm` | `11155111` | `SEPOLIA_RPC_URL` |
| `POLYGON_AMOY` | `evm` | `80002` | `POLYGON_RPC_URL` |
| `SOLANA_DEVNET` | `solana` | `devnet` | `SOLANA_RPC_URL` |
| `ENDLESS_TESTNET` | `endless` | `endless-testnet` | `ENDLESS_RPC_URL` |

When an RPC URL is omitted, the adapter uses a `mock://` RPC fallback for local integration tests.

## Adapter boundaries

```text
Luffa Fabric Core
  -> SettlementInstruction
  -> SettlementService
  -> EvmSettlementAdapter | SolanaSettlementAdapter | EndlessSettlementAdapter
  -> RPC / wallet rail
```

The execution engine does not import `ethers`, `viem`, `wagmi`, or Solana SDK packages.

## Settlement rails

- `luffa-points`
- `evm-native`
- `evm-erc20`
- `solana-native`
- `solana-spl`

Endless is reserved as an adapter abstraction for Luffa wallet rail integration in MVP 2.
