export type ChainType = "evm" | "solana" | "endless";

export type ChainKey =
  | "BASE_SEPOLIA"
  | "BASE_MAINNET"
  | "ETHEREUM_SEPOLIA"
  | "POLYGON_AMOY"
  | "SOLANA_DEVNET"
  | "ENDLESS_TESTNET";

export interface ChainConfig {
  chainKey: ChainKey;
  chainId: number | string;
  chainType: ChainType;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: string;
  testnet: boolean;
}
