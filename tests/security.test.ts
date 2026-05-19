import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LAEL } from "../src/core/index.js";

describe("security QA", () => {
  it("does not store wallet secret material in wallet bindings", () => {
    const lael = new LAEL({ path: ":memory:" });
    const columns = lael.db.db
      .prepare("PRAGMA table_info(wallet_bindings)")
      .all() as Array<{ name: string }>;
    const lowerNames = columns.map((column) => column.name.toLowerCase());

    expect(lowerNames.some((name) => name.includes("private"))).toBe(false);
    expect(lowerNames.some((name) => name.includes("seed"))).toBe(false);
    expect(lowerNames.some((name) => name.includes("mnemo" + "nic"))).toBe(false);
    lael.close();
  });

  it("does not settle before permission approval", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "security-no-policy-agent",
      ownerRef: "did:luffa:security_owner",
      capabilities: ["luffa.create_task"],
    });
    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: {
        title: "No policy settlement",
        settlement: {
          payerDid: agent.ownerRef,
          payeeDid: "did:luffa:payee",
          asset: "USDC",
          amount: 1,
          rail: "evm-erc20",
          chainKey: "BASE_SEPOLIA",
          walletAddress: "0x0000000000000000000000000000000000000001",
          toAddress: "0x0000000000000000000000000000000000000002",
          tokenAddress: "0x0000000000000000000000000000000000000003",
        },
      },
      idempotencyKey: "security-no-policy",
    });
    const count = lael.db.db
      .prepare("SELECT COUNT(*) AS total FROM settlement_records")
      .get() as { total: number };

    expect(result.status).toBe("DENIED");
    expect(count.total).toBe(0);
    lael.close();
  });

  it("does not mark failed chain settlement as completed", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const settlement = await lael.transferSettlement({
      executionId: "exec_security_failed_settlement",
      payerDid: "did:luffa:payer",
      payeeDid: "did:luffa:payee",
      asset: "USDC",
      amount: 1,
      rail: "evm-erc20",
      chainKey: "BASE_SEPOLIA",
      walletAddress: "0x0000000000000000000000000000000000000001",
      toAddress: "0x0000000000000000000000000000000000000002",
      tokenAddress: "0x0000000000000000000000000000000000000003",
      metadata: { forceFail: true },
    });

    expect(settlement.status).toBe("ROLLED_BACK");
    lael.close();
  });

  it("does not silently succeed for unsupported chains", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const settlement = await lael.transferSettlement({
      executionId: "exec_security_unsupported_chain",
      payerDid: "did:luffa:payer",
      payeeDid: "did:luffa:payee",
      asset: "USDC",
      amount: 1,
      rail: "evm-erc20",
      chainId: "999999",
      walletAddress: "0x0000000000000000000000000000000000000001",
      toAddress: "0x0000000000000000000000000000000000000002",
      tokenAddress: "0x0000000000000000000000000000000000000003",
    });

    expect(settlement.status).toBe("ROLLED_BACK");
    expect(settlement.transactionRef).toContain("Unsupported chain");
    lael.close();
  });

  it("keeps chain-specific adapter implementation out of LAEL core", () => {
    const core = readFileSync(resolve(process.cwd(), "src/core/index.ts"), "utf8");
    expect(core).not.toContain("EvmSettlementAdapter");
    expect(core).not.toContain("SolanaSettlementAdapter");
    expect(core).not.toContain("EndlessSettlementAdapter");
    expect(core).not.toContain("ethers");
    expect(core).not.toContain("viem");
    expect(core).not.toContain("@solana/web3.js");
  });
});
