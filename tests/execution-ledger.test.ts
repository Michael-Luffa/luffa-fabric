import { describe, expect, it } from "vitest";
import { LAEL } from "../src/core/index.js";
import { createDevWalletSignature, WalletType } from "../src/wallet/index.js";

describe("execution ledger", () => {
  it("records successful execution fields and updates Merkle root", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await registerAgentWithPolicy(lael, ["luffa.create_task"]);
    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: { title: "Ledger success", communityId: "community_001" },
      rawInput: "Create ledger task",
      idempotencyKey: "ledger-success",
    });
    const record = lael.getExecutionRecord(result.executionId);

    expect(record?.executionId).toBe(result.executionId);
    expect(record?.agentId).toBe(agent.internalId);
    expect(record?.action).toBe("luffa.create_task");
    expect(record?.params.title).toBe("Ledger success");
    expect(record?.status).toBe("SUCCESS");
    expect(record?.permissionDecisionId).toMatch(/^decision_/);
    expect(record?.merkleLeafHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record?.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    expect(record?.rawInput).toBe("Create ledger task");
    expect(record?.zkProof).toBeUndefined();
    expect(record?.teeAttestation).toBeUndefined();
    lael.close();
  });

  it("records denied executions", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await registerAgentWithPolicy(lael, ["luffa.send_message"]);
    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: { title: "Denied ledger task" },
      idempotencyKey: "ledger-denied",
    });
    const record = lael.getExecutionRecord(result.executionId);

    expect(result.status).toBe("DENIED");
    expect(record?.status).toBe("DENIED");
    expect(record?.permissionDecisionId).toMatch(/^decision_/);
    expect(record?.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    lael.close();
  });

  it("saves txHash in settlement and execution records", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await registerAgentWithPolicy(lael, ["luffa.create_task"], {
      allowedAssets: ["USDC"],
      allowedChains: ["BASE_SEPOLIA"],
      maxBudgetPerAction: 5,
    });
    const walletAddress = "0x0000000000000000000000000000000000000001";
    await bindDevEvmWallet(lael, agent.ownerRef, walletAddress);
    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: {
        title: "Ledger settlement",
        settlement: {
          payerDid: agent.ownerRef,
          payeeDid: "did:luffa:payee",
          asset: "USDC",
          amount: 1,
          rail: "evm-erc20",
          chainKey: "BASE_SEPOLIA",
          walletAddress,
          toAddress: "0x0000000000000000000000000000000000000002",
          tokenAddress: "0x0000000000000000000000000000000000000003",
          txHash: "0x5555555555555555555555555555555555555555555555555555555555555555",
        },
      },
      idempotencyKey: "ledger-settlement",
      context: { budget: 1 },
    });
    const record = lael.getExecutionRecord(result.executionId);
    const settlement = record?.settlementId
      ? lael.settlement.getSettlementRecord(record.settlementId)
      : undefined;

    expect(result.status).toBe("SUCCESS");
    expect(record?.txHash).toBe("0x5555555555555555555555555555555555555555555555555555555555555555");
    expect(record?.walletAddress).toBe(walletAddress.toLowerCase());
    expect(settlement?.txHash).toBe(record?.txHash);
    lael.close();
  });

  it("idempotencyKey prevents duplicate execution records", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await registerAgentWithPolicy(lael, ["luffa.send_message"]);
    const first = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "one" },
      idempotencyKey: "ledger-idempotent",
    });
    const second = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "two" },
      idempotencyKey: "ledger-idempotent",
    });
    const count = lael.db.db
      .prepare("SELECT COUNT(*) AS total FROM execution_records")
      .get() as { total: number };

    expect(second.idempotent).toBe(true);
    expect(second.executionId).toBe(first.executionId);
    expect(count.total).toBe(1);
    lael.close();
  });
});

async function registerAgentWithPolicy(
  lael: LAEL,
  actions: string[],
  extraRules: Record<string, unknown> = {},
) {
  const agent = await lael.registerAgent({
    identityType: "API_KEY",
    externalId: `ledger-agent-${Math.random()}`,
    ownerRef: "did:luffa:ledger_owner",
    capabilities: actions,
  });
  await lael.createPolicy({
    ownerRef: agent.ownerRef,
    jsonRules: {
      allowedActions: actions,
      ...extraRules,
    },
  });
  return agent;
}

async function bindDevEvmWallet(
  lael: LAEL,
  ownerRef: string,
  address: string,
): Promise<void> {
  const pending = lael.connectWallet({
    ownerRef,
    walletType: WalletType.METAMASK,
    chainType: "evm",
    address,
  });
  await lael.verifyWallet({
    bindingId: pending.bindingId,
    ownerRef,
    walletType: WalletType.METAMASK,
    chainType: "evm",
    address,
    nonce: pending.nonce,
    signature: createDevWalletSignature(pending.message, pending.address),
  });
}
