import type { ChainKey, ChainType } from "../chains/types.js";

export type SettlementAsset =
  | "LUFFA_POINTS"
  | "ETH"
  | "USDC"
  | "USDT"
  | "SOL"
  | "SPL_TOKEN";

export type SettlementRail =
  | "luffa-points"
  | "evm-native"
  | "evm-erc20"
  | "solana-native"
  | "solana-spl";

export type SettlementStatus = "PENDING" | "COMPLETED" | "FAILED" | "ROLLED_BACK";

export interface SettlementInstruction {
  settlementId?: string;
  executionId: string;
  payerDid: string;
  payeeDid: string;
  asset: SettlementAsset;
  amount: number;
  rail: SettlementRail;
  chainKey?: ChainKey;
  chainType?: ChainType;
  chainId?: string;
  fromAddress?: string;
  toAddress?: string;
  walletAddress?: string;
  tokenAddress?: string;
  txHash?: string;
  signedTransaction?: string;
  metadata?: Record<string, unknown>;
  schemaVersion?: string;
  apiVersion?: string;
}

export interface SettlementRecord {
  settlementId: string;
  executionId: string;
  payerDid: string;
  payeeDid: string;
  asset: SettlementAsset;
  amount: number;
  rail: SettlementRail;
  status: SettlementStatus;
  transactionRef?: string;
  chainType?: ChainType;
  chainId?: string;
  txHash?: string;
  walletAddress?: string;
  gasUsed?: string;
  blockNumber?: number;
  createdAt: string;
  schemaVersion: string;
  apiVersion: string;
}

export interface SettlementTransferInput {
  settlementId?: string;
  chainKey?: ChainKey;
  chainType: ChainType;
  chainId: string;
  asset: SettlementAsset;
  rail: SettlementRail;
  amount: string;
  fromAddress: string;
  toAddress: string;
  tokenAddress?: string;
  txHash?: string;
  signedTransaction?: string;
  metadata?: Record<string, unknown>;
}

export interface SettlementTransferResult {
  status: SettlementStatus;
  txHash: string;
  chainType: ChainType;
  chainId: string;
  gasUsed?: string;
  blockNumber?: number;
  raw?: Record<string, unknown>;
}

export interface TransactionVerification {
  txHash: string;
  chainType: ChainType;
  chainId?: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "NOT_FOUND" | "UNKNOWN";
  gasUsed?: string;
  blockNumber?: number;
  confirmations?: number;
  raw?: Record<string, unknown>;
}

export interface SettlementAdapter {
  chainType: ChainType;
  getBalance(address: string): Promise<string>;
  transfer(input: SettlementTransferInput): Promise<SettlementTransferResult>;
  verifyTransaction(txHash: string): Promise<TransactionVerification>;
  estimateFee(input: SettlementTransferInput): Promise<string>;
}
