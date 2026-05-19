# Luffa Fabric MVP 2 Wallet Test Guide

Completed by **Luffa AI Research Lab**.

## Supported wallets

- Coinbase Wallet
- OKX Wallet
- MetaMask
- WalletConnect v2 wallets
- Phantom for Solana
- Luffa Wallet

## Binding flow

1. Connect a wallet in the frontend.
2. The frontend calls `POST /v2/wallet/connect` with `ownerRef`, `walletType`, `chainType`, and `address`.
3. Luffa Fabric returns a nonce and canonical binding message.
4. The wallet signs that message.
5. The frontend calls `POST /v2/wallet/verify`.
6. Luffa Fabric verifies the signature and records a DID-to-wallet binding.

Luffa Fabric never accepts a mnemonic, seed phrase, or master private key.

## Example connect request

```json
{
  "ownerRef": "did:luffa:user_001",
  "walletType": "metamask",
  "chainType": "evm",
  "address": "0x0000000000000000000000000000000000000001"
}
```

## Example verify request

```json
{
  "bindingId": "wallet_...",
  "ownerRef": "did:luffa:user_001",
  "walletType": "metamask",
  "chainType": "evm",
  "address": "0x0000000000000000000000000000000000000001",
  "nonce": "nonce_...",
  "signature": "0x..."
}
```

## Chain settlement test

Use Base Sepolia for the primary EVM test:

1. Bind a Coinbase Wallet or MetaMask address.
2. Create a policy that allows `luffa.create_task`, asset `USDC`, and chain `BASE_SEPOLIA`.
3. Invoke `luffa.create_task` with a settlement instruction.
4. Submit the user-signed tx hash through `/v2/settlement/transfer`.
5. Confirm `/v2/settlement/tx/:txHash?chainType=evm&chainId=84532` returns a chain status.

For Solana Devnet, bind Phantom, submit a SOL or SPL token signature, and verify through `chainType=solana&chainId=devnet`.
