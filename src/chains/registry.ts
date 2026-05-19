import type { ChainConfig, ChainKey, ChainType } from "./types.js";

const settlementMode = process.env.LAEL_SETTLEMENT_MODE ?? "mock";

export const CHAIN_REGISTRY: Record<ChainKey, ChainConfig> = {
  BASE_SEPOLIA: {
    chainKey: "BASE_SEPOLIA",
    chainId: 84532,
    chainType: "evm",
    rpcUrl: rpcUrl("base-sepolia", process.env.BASE_RPC_URL),
    explorerUrl: "https://sepolia.basescan.org",
    nativeCurrency: "ETH",
    testnet: true,
  },
  BASE_MAINNET: {
    chainKey: "BASE_MAINNET",
    chainId: 8453,
    chainType: "evm",
    rpcUrl: rpcUrl("base-mainnet", process.env.BASE_MAINNET_RPC_URL ?? process.env.BASE_RPC_URL),
    explorerUrl: "https://basescan.org",
    nativeCurrency: "ETH",
    testnet: false,
  },
  ETHEREUM_SEPOLIA: {
    chainKey: "ETHEREUM_SEPOLIA",
    chainId: 11155111,
    chainType: "evm",
    rpcUrl: rpcUrl("ethereum-sepolia", process.env.SEPOLIA_RPC_URL),
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: "ETH",
    testnet: true,
  },
  POLYGON_AMOY: {
    chainKey: "POLYGON_AMOY",
    chainId: 80002,
    chainType: "evm",
    rpcUrl: rpcUrl("polygon-amoy", process.env.POLYGON_RPC_URL),
    explorerUrl: "https://amoy.polygonscan.com",
    nativeCurrency: "POL",
    testnet: true,
  },
  SOLANA_DEVNET: {
    chainKey: "SOLANA_DEVNET",
    chainId: "devnet",
    chainType: "solana",
    rpcUrl: rpcUrl("solana-devnet", process.env.SOLANA_RPC_URL),
    explorerUrl: "https://explorer.solana.com/?cluster=devnet",
    nativeCurrency: "SOL",
    testnet: true,
  },
  ENDLESS_TESTNET: {
    chainKey: "ENDLESS_TESTNET",
    chainId: "endless-testnet",
    chainType: "endless",
    rpcUrl: rpcUrl("endless-testnet", process.env.ENDLESS_RPC_URL),
    explorerUrl: "https://endless.link",
    nativeCurrency: "ENDLESS",
    testnet: true,
  },
};

function rpcUrl(mockName: string, configured: string | undefined): string {
  if (settlementMode === "mock") {
    return `mock://${mockName}`;
  }
  return configured ?? `mock://${mockName}`;
}

export function listChains(): ChainConfig[] {
  return Object.values(CHAIN_REGISTRY);
}

export function getChainConfig(chainKeyOrId: ChainKey | string | number): ChainConfig | undefined {
  const direct = CHAIN_REGISTRY[String(chainKeyOrId) as ChainKey];
  if (direct) {
    return direct;
  }

  return Object.values(CHAIN_REGISTRY).find(
    (chain) => String(chain.chainId) === String(chainKeyOrId),
  );
}

export function getDefaultChainForType(chainType: ChainType): ChainConfig | undefined {
  return Object.values(CHAIN_REGISTRY).find((chain) => chain.chainType === chainType);
}
