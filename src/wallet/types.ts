import type { ChainType } from "../chains/types.js";

export enum WalletType {
  COINBASE = "coinbase",
  OKX = "okx",
  METAMASK = "metamask",
  WALLETCONNECT = "walletconnect",
  PHANTOM = "phantom",
  LUFFA = "luffa",
}

export interface WalletBinding {
  bindingId: string;
  ownerRef: string;
  walletType: WalletType;
  chainType: ChainType;
  address: string;
  signature: string;
  nonce: string;
  nonceExpiresAt?: string;
  verified: boolean;
  createdAt: string;
}

export interface ConnectWalletInput {
  ownerRef: string;
  walletType: WalletType;
  chainType: ChainType;
  address: string;
}

export interface ConnectWalletResult {
  bindingId: string;
  ownerRef: string;
  walletType: WalletType;
  chainType: ChainType;
  address: string;
  nonce: string;
  nonceExpiresAt: string;
  message: string;
}

export interface VerifyWalletInput {
  bindingId?: string;
  ownerRef: string;
  walletType: WalletType;
  chainType: ChainType;
  address: string;
  nonce: string;
  signature: string;
}
