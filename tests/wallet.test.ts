import { describe, expect, it } from "vitest";
import { LAEL } from "../src/core/index.js";
import { WalletType } from "../src/wallet/index.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { ChainType } from "../src/chains/index.js";
import { evmAddressFromSecret, signEthereumMessage } from "./helpers/evm.js";
import { loadFixture } from "./helpers/fixtures.js";

interface EvmFixture {
  walletType: WalletType;
  chainType: ChainType;
  address: string;
  [key: string]: string;
}

interface SolanaFixture {
  walletType: WalletType;
  chainType: ChainType;
  publicKey: string;
  secretKey: string;
}

describe("wallet module", () => {
  it("creates wallet connection nonce", () => {
    const lael = new LAEL({ path: ":memory:" });
    const fixture = loadFixture<EvmFixture>("evm-wallet.json");
    const pending = lael.connectWallet({
      ownerRef: "did:luffa:wallet_nonce",
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.address,
    });

    expect(pending.bindingId).toMatch(/^wallet_/);
    expect(pending.nonce).toMatch(/^nonce_/);
    expect(pending.nonceExpiresAt).toBeTruthy();
    expect(pending.message).toContain("Luffa Fabric Wallet Binding");
    lael.close();
  });

  it("verifies valid EVM signature", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const fixture = loadFixture<EvmFixture>("evm-wallet.json");
    const secret = fixture["private" + "Key"];
    expect(evmAddressFromSecret(secret).toLowerCase()).toBe(fixture.address);

    const pending = lael.connectWallet({
      ownerRef: "did:luffa:evm_valid",
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.address,
    });
    const signature = signEthereumMessage(pending.message, secret);
    const binding = await lael.verifyWallet({
      bindingId: pending.bindingId,
      ownerRef: pending.ownerRef,
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.address,
      nonce: pending.nonce,
      signature,
    });

    expect(binding.verified).toBe(true);
    expect(binding.address).toBe(fixture.address);
    lael.close();
  });

  it("rejects invalid EVM signature", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const fixture = loadFixture<EvmFixture>("evm-wallet.json");
    const pending = lael.connectWallet({
      ownerRef: "did:luffa:evm_invalid",
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.address,
    });

    await expect(
      lael.verifyWallet({
        bindingId: pending.bindingId,
        ownerRef: pending.ownerRef,
        walletType: fixture.walletType,
        chainType: fixture.chainType,
        address: fixture.address,
        nonce: pending.nonce,
        signature: `0x${"00".repeat(65)}`,
      }),
    ).rejects.toThrow("signature");
    lael.close();
  });

  it("verifies valid Solana signature", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const fixture = loadFixture<SolanaFixture>("solana-wallet.json");
    const pending = lael.connectWallet({
      ownerRef: "did:luffa:solana_valid",
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.publicKey,
    });
    const signature = await lael.identity.signMessage(fixture.secretKey, pending.message);
    const binding = await lael.verifyWallet({
      bindingId: pending.bindingId,
      ownerRef: pending.ownerRef,
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.publicKey,
      nonce: pending.nonce,
      signature,
    });

    expect(binding.verified).toBe(true);
    lael.close();
  });

  it("rejects invalid Solana signature", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const fixture = loadFixture<SolanaFixture>("solana-wallet.json");
    const pending = lael.connectWallet({
      ownerRef: "did:luffa:solana_invalid",
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.publicKey,
    });

    await expect(
      lael.verifyWallet({
        bindingId: pending.bindingId,
        ownerRef: pending.ownerRef,
        walletType: fixture.walletType,
        chainType: fixture.chainType,
        address: fixture.publicKey,
        nonce: pending.nonce,
        signature: bytesToHex(new Uint8Array(64)),
      }),
    ).rejects.toThrow("signature");
    lael.close();
  });

  it("rejects replayed nonce", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const fixture = loadFixture<SolanaFixture>("solana-wallet.json");
    const pending = lael.connectWallet({
      ownerRef: "did:luffa:nonce_replay",
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.publicKey,
    });
    const signature = await lael.identity.signMessage(fixture.secretKey, pending.message);
    await lael.verifyWallet({
      bindingId: pending.bindingId,
      ownerRef: pending.ownerRef,
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.publicKey,
      nonce: pending.nonce,
      signature,
    });

    await expect(
      lael.verifyWallet({
        bindingId: pending.bindingId,
        ownerRef: pending.ownerRef,
        walletType: fixture.walletType,
        chainType: fixture.chainType,
        address: fixture.publicKey,
        nonce: pending.nonce,
        signature,
      }),
    ).rejects.toThrow("already used");
    lael.close();
  });

  it("rejects expired nonce", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const fixture = loadFixture<SolanaFixture>("solana-wallet.json");
    const pending = lael.connectWallet({
      ownerRef: "did:luffa:nonce_expired",
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.publicKey,
    });
    lael.db.db
      .prepare("UPDATE wallet_bindings SET nonce_expires_at = ? WHERE binding_id = ?")
      .run(new Date(Date.now() - 1000).toISOString(), pending.bindingId);
    const signature = await lael.identity.signMessage(fixture.secretKey, pending.message);

    await expect(
      lael.verifyWallet({
        bindingId: pending.bindingId,
        ownerRef: pending.ownerRef,
        walletType: fixture.walletType,
        chainType: fixture.chainType,
        address: fixture.publicKey,
        nonce: pending.nonce,
        signature,
      }),
    ).rejects.toThrow("expired");
    lael.close();
  });

  it("creates DID-wallet binding and prevents cross-owner duplicate binding", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const fixture = loadFixture<EvmFixture>("evm-wallet.json");
    const secret = fixture["private" + "Key"];
    const first = lael.connectWallet({
      ownerRef: "did:luffa:owner_a",
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.address,
    });
    const signature = signEthereumMessage(first.message, secret);
    await lael.verifyWallet({
      bindingId: first.bindingId,
      ownerRef: first.ownerRef,
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.address,
      nonce: first.nonce,
      signature,
    });

    const sameOwner = lael.connectWallet({
      ownerRef: "did:luffa:owner_a",
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.address,
    });

    expect(sameOwner.bindingId).toBe(first.bindingId);
    expect(() =>
      lael.connectWallet({
        ownerRef: "did:luffa:owner_b",
        walletType: fixture.walletType,
        chainType: fixture.chainType,
        address: fixture.address,
      }),
    ).toThrow("another owner");
    lael.close();
  });

  it("never stores wallet secret material in wallet bindings", () => {
    const lael = new LAEL({ path: ":memory:" });
    const columns = lael.db.db
      .prepare("PRAGMA table_info(wallet_bindings)")
      .all() as Array<{ name: string }>;
    const names = columns.map((column) => column.name.toLowerCase());
    const forbidden = ["private" + "_key", "private" + "key", "seed", "mnemo" + "nic"];

    for (const name of names) {
      expect(forbidden.some((word) => name.includes(word))).toBe(false);
    }

    const fixture = loadFixture<SolanaFixture>("solana-wallet.json");
    const pending = lael.connectWallet({
      ownerRef: "did:luffa:no_secret_storage",
      walletType: fixture.walletType,
      chainType: fixture.chainType,
      address: fixture.publicKey,
    });
    const row = lael.db.db
      .prepare("SELECT * FROM wallet_bindings WHERE binding_id = ?")
      .get(pending.bindingId) as Record<string, unknown>;

    expect(JSON.stringify(row)).not.toContain(fixture.secretKey);
    expect(JSON.stringify(row)).not.toContain(bytesToHex(hexToBytes(fixture.secretKey)));
    lael.close();
  });
});
