import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LAEL } from "../src/core/index.js";
import { buildServer } from "../src/api/server.js";
import { createMcpTools } from "../src/mcp/tools.js";
import { createDevWalletSignature, WalletType } from "../src/wallet/index.js";

async function createAgentWithPolicy(action = "luffa.send_message") {
  const lael = new LAEL({ path: ":memory:" });
  const agent = await lael.registerAgent({
    identityType: "API_KEY",
    externalId: `agent-${randomUUID()}`,
    ownerRef: "did:luffa:user_001",
    capabilities: [action],
  });
  await lael.createPolicy({
    ownerRef: agent.ownerRef,
    priority: 1,
    jsonRules: { allowedActions: [action] },
  });
  return { lael, agent };
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

describe("LAEL MVP integration", () => {
  it("registers and resolves an agent", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "openclaw-agent-001",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.send_message"],
    });

    const resolved = await lael.identity.resolveAgent(agent.internalId);
    expect(resolved.internalId).toBe(agent.internalId);
    expect(resolved.publicKey).toMatch(/^[a-f0-9]+$/);
    expect(resolved.status).toBe("active");
    expect(resolved.schemaVersion).toBe("1.0");
    expect(resolved.apiVersion).toBe("v1");
    lael.close();
  });

  it("updates agent metadata and deactivates agents", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "lifecycle-agent",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.send_message"],
      metadata: { displayName: "Before" },
    });

    const updated = await lael.updateAgentMetadata(agent.internalId, {
      metadata: { displayName: "After" },
    });
    const deactivated = await lael.deactivateAgent(agent.internalId);
    const inactiveInvoke = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "hello" },
      idempotencyKey: "inactive-agent",
    });

    expect(updated.metadata?.displayName).toBe("After");
    expect(deactivated.status).toBe("inactive");
    expect(inactiveInvoke.status).toBe("DENIED");
    expect(inactiveInvoke.result.error).toBe("Agent inactive");
    lael.close();
  });

  it("issues and revokes capability tokens", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "token-agent",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.create_task"],
    });
    const token = await lael.issueCapabilityToken({
      granteeDid: agent.internalId,
      scope: ["luffa.create_task"],
    });

    expect(await lael.identity.verifyCapabilityToken(token.tokenId)).toBe(true);
    await lael.identity.revokeCapabilityToken(token.tokenId);
    expect(await lael.identity.verifyCapabilityToken(token.tokenId)).toBe(false);
    lael.close();
  });

  it("keeps service-issued capability tokens verifiable across restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lael-token-persistence-"));
    const dbPath = join(dir, "lael.db");

    const first = new LAEL({ path: dbPath });
    const agent = await first.registerAgent({
      identityType: "API_KEY",
      externalId: "persistent-token-agent",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.send_message"],
    });
    const token = await first.issueCapabilityToken({
      granteeDid: agent.internalId,
      scope: ["luffa.send_message"],
    });
    first.close();

    const second = new LAEL({ path: dbPath });
    expect(await second.identity.verifyCapabilityToken(token.tokenId)).toBe(true);
    second.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails expired capability token verification", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const token = await lael.issueCapabilityToken({
      granteeDid: "agent_expired",
      scope: ["luffa.send_message"],
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    expect(await lael.identity.verifyCapabilityToken(token.tokenId)).toBe(false);
    lael.close();
  });

  it("default denies permission", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "default-deny-agent",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.send_message"],
    });

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "hello" },
      idempotencyKey: "deny-default",
    });

    expect(result.status).toBe("DENIED");
    expect(result.result.decision).toBe("DENY");
    lael.close();
  });

  it("allows permission by policy", async () => {
    const { lael, agent } = await createAgentWithPolicy();
    const decision = await lael.permission.evaluatePermission({
      agentId: agent.internalId,
      ownerRef: agent.ownerRef,
      action: "luffa.send_message",
      params: {},
      riskLevel: agent.riskLevel,
    });

    expect(decision.decision).toBe("ALLOW");
    lael.close();
  });

  it("denies override allows", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "deny-override-agent",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.send_message"],
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      priority: 1,
      jsonRules: { allowedActions: ["luffa.send_message"] },
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      priority: 0,
      jsonRules: {
        allowedActions: [],
        deniedActions: ["luffa.send_message"],
      },
    });

    const decision = await lael.permission.evaluatePermission({
      agentId: agent.internalId,
      ownerRef: agent.ownerRef,
      action: "luffa.send_message",
      params: {},
      riskLevel: agent.riskLevel,
    });

    expect(decision.decision).toBe("DENY");
    lael.close();
  });

  it("denies requests over budget", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "budget-agent",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.create_task"],
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      jsonRules: {
        allowedActions: ["luffa.create_task"],
        maxBudgetPerAction: 1,
      },
    });

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: { title: "Too expensive" },
      idempotencyKey: "budget-deny",
      context: { budget: 2 },
    });

    expect(result.status).toBe("DENIED");
    expect(result.result.error).toContain("Budget");
    lael.close();
  });

  it("denies nested settlement amounts that exceed maxBudgetPerAction", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "nested-budget-agent",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.create_task"],
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      jsonRules: {
        allowedActions: ["luffa.create_task"],
        maxBudgetPerAction: 1,
      },
    });

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: {
        title: "Nested settlement should count",
        settlement: {
          payerDid: agent.ownerRef,
          payeeDid: "did:luffa:payee",
          amount: 2,
        },
      },
      idempotencyKey: "nested-budget-deny",
    });

    expect(result.status).toBe("DENIED");
    expect(result.result.error).toContain("Budget");
    lael.close();
  });

  it("enforces maxTotalBudget across allowed invocations", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "total-budget-agent",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.create_task"],
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      jsonRules: {
        allowedActions: ["luffa.create_task"],
        maxTotalBudget: 3,
      },
    });

    const first = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: { title: "First", budget: 2 },
      idempotencyKey: "total-budget-first",
    });
    const second = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: { title: "Second", budget: 2 },
      idempotencyKey: "total-budget-second",
    });

    expect(first.status).toBe("SUCCESS");
    expect(second.status).toBe("DENIED");
    expect(second.result.error).toContain("maxTotalBudget");
    lael.close();
  });

  it("uses the highest-priority matching allow policy", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "priority-agent",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.create_task"],
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      priority: 0,
      jsonRules: { allowedActions: ["luffa.create_task"], maxBudgetPerAction: 10 },
    });
    const highPriority = await lael.createPolicy({
      ownerRef: agent.ownerRef,
      priority: 100,
      jsonRules: { allowedActions: ["luffa.create_task"], maxBudgetPerAction: 1 },
    });

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: { title: "Priority budget", budget: 2 },
      idempotencyKey: "priority-budget",
    });
    const audit = lael.db.db
      .prepare("SELECT matched_policy_id AS matchedPolicyId FROM permission_audits WHERE decision_id = ?")
      .get(result.permissionDecisionId) as { matchedPolicyId: string };

    expect(result.status).toBe("DENIED");
    expect(audit.matchedPolicyId).toBe(highPriority.policyId);
    lael.close();
  });

  it("enforces context constraints and risk thresholds", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "context-risk-agent",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.send_message"],
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      jsonRules: {
        allowedActions: ["luffa.send_message"],
        riskThreshold: 0.5,
        contextConstraints: [{ communityId: "community_001" }],
      },
    });

    const wrongContext = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "wrong context" },
      idempotencyKey: "wrong-context",
      context: { communityId: "community_002" },
    });
    const highRisk = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "high risk" },
      idempotencyKey: "high-risk-threshold",
      context: { communityId: "community_001", riskScore: 0.9 },
    });

    expect(wrongContext.status).toBe("DENIED");
    expect(wrongContext.result.error).toBe("Default deny");
    expect(highRisk.status).toBe("DENIED");
    expect(highRisk.result.error).toContain("Risk");
    lael.close();
  });

  it("executes an allowed action and writes an execution record", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.create_task");
    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: { communityId: "community_001", title: "Invite 10 new members" },
      rawInput: "Create a task",
      idempotencyKey: "allowed-task",
    });

    const record = lael.getExecutionRecord(result.executionId);
    expect(result.status).toBe("SUCCESS");
    expect(record?.executionId).toBe(result.executionId);
    expect(record?.merkleLeafHash).toMatch(/^[a-f0-9]{64}$/);
    lael.close();
  });

  it("blocks denied actions", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.send_message");
    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: { title: "Not allowed" },
      idempotencyKey: "blocked-task",
    });

    expect(result.status).toBe("DENIED");
    lael.close();
  });

  it("resolves and invokes agents by external ID", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "external-agent-id",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.send_message"],
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      jsonRules: { allowedActions: ["luffa.send_message"] },
    });

    const result = await lael.invoke({
      agentId: "external-agent-id",
      action: "luffa.send_message",
      params: { body: "hello" },
      idempotencyKey: "external-id-invoke",
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.agentId).toBe(agent.internalId);
    lael.close();
  });

  it("generates and verifies Merkle proofs", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.send_message");
    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "hello" },
      idempotencyKey: "merkle-message",
    });

    const proof = lael.execution.generateMerkleProof(result.executionId);
    expect(lael.execution.verifyMerkleProof(proof)).toBe(true);
    expect(lael.execution.verifyMerkleProof({ ...proof, leafHash: "0".repeat(64) })).toBe(false);
    lael.close();
  });

  it("does not expose direct handler or record-writer bypass methods", () => {
    const lael = new LAEL({ path: ":memory:" });
    expect("runHandler" in lael.execution).toBe(false);
    expect("writeExecutionRecord" in lael.execution).toBe(false);
    lael.close();
  });

  it("refuses direct execution without a persisted permission audit", async () => {
    const lael = new LAEL({ path: ":memory:" });

    await expect(
      lael.execution.execute(
        {
          agentId: "agent_fake",
          action: "luffa.send_message",
          params: { body: "bypass" },
          idempotencyKey: "direct-bypass",
        },
        {
          decisionId: "decision_fake",
          agentId: "agent_fake",
          action: "luffa.send_message",
          decision: "ALLOW",
          riskScore: 0,
          budget: 0,
          requiresConfirmation: false,
          createdAt: new Date().toISOString(),
          schemaVersion: "1.0",
          apiVersion: "v1",
        },
      ),
    ).rejects.toThrow("persisted");

    lael.close();
  });

  it("refuses direct execution when a persisted permission audit does not match request", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.send_message");
    const decision = await lael.permission.evaluatePermission({
      agentId: agent.internalId,
      ownerRef: agent.ownerRef,
      action: "luffa.send_message",
      params: {},
      riskLevel: agent.riskLevel,
    });

    await expect(
      lael.execution.execute(
        {
          agentId: agent.internalId,
          action: "luffa.create_task",
          params: { title: "wrong action" },
          idempotencyKey: "mismatched-decision",
        },
        decision,
      ),
    ).rejects.toThrow("does not match");

    lael.close();
  });

  it("credits accounts and transfers atomically", () => {
    const lael = new LAEL({ path: ":memory:" });
    lael.settlement.createAccount("did:luffa:payer", "LUFFA_POINTS");
    lael.settlement.credit("did:luffa:payer", "LUFFA_POINTS", 10);

    const settlement = lael.settlement.transfer({
      executionId: "exec_001",
      payerDid: "did:luffa:payer",
      payeeDid: "did:luffa:payee",
      asset: "LUFFA_POINTS",
      amount: 4,
      rail: "luffa-points",
    });

    expect(settlement.status).toBe("COMPLETED");
    expect(lael.settlement.getBalance("did:luffa:payer", "LUFFA_POINTS")).toBe(6);
    expect(lael.settlement.getBalance("did:luffa:payee", "LUFFA_POINTS")).toBe(4);
    lael.close();
  });

  it("rolls back atomic transfer on insufficient balance", () => {
    const lael = new LAEL({ path: ":memory:" });
    lael.settlement.createAccount("did:luffa:payer", "LUFFA_POINTS");
    lael.settlement.credit("did:luffa:payer", "LUFFA_POINTS", 1);

    const settlement = lael.settlement.transfer({
      executionId: "exec_002",
      payerDid: "did:luffa:payer",
      payeeDid: "did:luffa:payee",
      asset: "LUFFA_POINTS",
      amount: 4,
      rail: "luffa-points",
    });

    expect(settlement.status).toBe("ROLLED_BACK");
    expect(lael.settlement.getBalance("did:luffa:payer", "LUFFA_POINTS")).toBe(1);
    expect(lael.settlement.getBalance("did:luffa:payee", "LUFFA_POINTS")).toBe(0);
    lael.close();
  });

  it("submits feedback, updates EMA reputation, and exports RLHF data", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.send_message");
    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "hello" },
      rawInput: "Say hello",
      idempotencyKey: "feedback-message",
    });

    const reputation = lael.submitFeedback(result.executionId, 5, "Good result");
    const rlhf = lael.exportRLHF();
    const execution = lael.getExecutionRecord(result.executionId);

    expect(reputation.score).toBeCloseTo(0.55);
    expect(reputation.feedbackCount).toBe(1);
    expect(execution?.feedback?.score).toBe(5);
    expect(rlhf).toHaveLength(1);
    expect(rlhf[0]?.rewardSignal).toBe(1);
    lael.close();
  });

  it("invokes through an MCP tool", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.create_task");
    const { callTool } = createMcpTools(lael);

    const response = await callTool("luffa.create_task", {
      agentId: agent.internalId,
      params: { communityId: "community_001", title: "MCP task" },
      idempotencyKey: "mcp-task",
    });
    const body = JSON.parse(response.content[0]?.text ?? "{}") as { status: string };

    expect(response.isError).toBeUndefined();
    expect(body.status).toBe("SUCCESS");
    lael.close();
  });

  it("registers an agent through an MCP tool", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const { callTool } = createMcpTools(lael);

    const response = await callTool("lael.register_agent", {
      identityType: "MCP_SERVER",
      externalId: "mcp-agent",
      ownerRef: "did:luffa:user_mcp",
      capabilities: ["luffa.send_message"],
    });
    const body = JSON.parse(response.content[0]?.text ?? "{}") as { agentId: string };

    expect(body.agentId).toMatch(/^agent_/);
    lael.close();
  });

  it("returns requires confirmation for high-risk actions", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "high-risk-agent",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.reward_user"],
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      jsonRules: { allowedActions: ["luffa.reward_user"] },
    });

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.reward_user",
      params: { payeeDid: "did:luffa:payee", amount: 1 },
      idempotencyKey: "high-risk-confirmation",
    });

    expect(result.status).toBe("DENIED");
    expect(result.result.decision).toBe("REQUIRES_CONFIRMATION");
    expect(result.result.requiresConfirmation).toBe(true);
    lael.close();
  });

  it("blocks invocation with a revoked capability token", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.send_message");
    const token = await lael.issueCapabilityToken({
      granteeDid: agent.internalId,
      scope: ["luffa.send_message"],
    });
    await lael.identity.revokeCapabilityToken(token.tokenId);

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "hello" },
      idempotencyKey: "revoked-token-invoke",
      capabilityTokenId: token.tokenId,
    });

    expect(result.status).toBe("DENIED");
    expect(result.result.error).toBe("Capability token verification failed");
    lael.close();
  });

  it("rejects tampered capability token signatures", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.send_message");
    const token = await lael.issueCapabilityToken({
      granteeDid: agent.internalId,
      scope: ["luffa.send_message"],
    });
    lael.db.db
      .prepare("UPDATE capability_tokens SET signature = ? WHERE token_id = ?")
      .run("00", token.tokenId);

    expect(await lael.identity.verifyCapabilityToken(token.tokenId)).toBe(false);
    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "tampered" },
      idempotencyKey: "tampered-token",
      capabilityTokenId: token.tokenId,
    });

    expect(result.status).toBe("DENIED");
    expect(result.result.error).toBe("Capability token verification failed");
    lael.close();
  });

  it("blocks invocation when capability token scope does not include the action", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.send_message");
    const token = await lael.issueCapabilityToken({
      granteeDid: agent.internalId,
      scope: ["luffa.create_task"],
    });

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "hello" },
      idempotencyKey: "wrong-scope-token-invoke",
      capabilityTokenId: token.tokenId,
    });

    expect(result.status).toBe("DENIED");
    expect(result.result.error).toBe("Capability token scope denied");
    lael.close();
  });

  it("blocks invocation with an expired capability token", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.send_message");
    const token = await lael.issueCapabilityToken({
      granteeDid: agent.internalId,
      scope: ["luffa.send_message"],
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "hello" },
      idempotencyKey: "expired-token-invoke",
      capabilityTokenId: token.tokenId,
    });

    expect(result.status).toBe("DENIED");
    expect(result.result.error).toBe("Capability token verification failed");
    lael.close();
  });

  it("records failed execution when settlement rolls back inside invoke", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.create_task");
    lael.settlement.createAccount(agent.ownerRef, "LUFFA_POINTS");
    lael.settlement.credit(agent.ownerRef, "LUFFA_POINTS", 1);

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: {
        communityId: "community_001",
        title: "Underfunded task",
        settlement: {
          payerDid: agent.ownerRef,
          payeeDid: "did:luffa:payee",
          amount: 5,
        },
      },
      idempotencyKey: "invoke-settlement-rollback",
      context: { budget: 5 },
    });
    const record = lael.getExecutionRecord(result.executionId);

    expect(result.status).toBe("FAILED");
    expect(result.settlementStatus).toBe("ROLLED_BACK");
    expect(record?.settlementId).toMatch(/^settle_/);
    expect(lael.settlement.getBalance(agent.ownerRef, "LUFFA_POINTS")).toBe(1);
    expect(lael.settlement.getBalance("did:luffa:payee", "LUFFA_POINTS")).toBe(0);
    lael.close();
  });

  it("invokes through the REST API", async () => {
    const { app, lael } = await buildServer({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "rest-agent",
      ownerRef: "did:luffa:user_rest",
      capabilities: ["luffa.create_task"],
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      jsonRules: { allowedActions: ["luffa.create_task"] },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/agent/invoke",
      payload: {
        agentId: agent.internalId,
        action: "luffa.create_task",
        params: { communityId: "community_001", title: "REST task" },
        idempotencyKey: "rest-task",
      },
    });
    const body = response.json() as { status: string; merkleRoot: string };

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("SUCCESS");
    expect(body.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    await app.close();
  });

  it("runs the REST register-policy-invoke-feedback-reputation flow", async () => {
    const { app, lael } = await buildServer({ path: ":memory:" });
    lael.createAccount("did:luffa:user_rest_full");
    lael.creditAccount("did:luffa:user_rest_full", 7);

    const register = await app.inject({
      method: "POST",
      url: "/v1/agents/register",
      payload: {
        identityType: "API_KEY",
        externalId: "rest-full-agent",
        ownerRef: "did:luffa:user_rest_full",
        capabilities: ["luffa.send_message"],
      },
    });
    const registered = register.json() as {
      agentId: string;
      publicKey: string;
      capabilities: string[];
      profile: { schemaVersion: string; apiVersion: string };
    };

    const policy = await app.inject({
      method: "POST",
      url: "/v1/policies",
      payload: {
        ownerRef: "did:luffa:user_rest_full",
        jsonRules: { allowedActions: ["luffa.send_message"] },
      },
    });
    const invoke = await app.inject({
      method: "POST",
      url: "/v1/agent/invoke",
      payload: {
        agentId: registered.agentId,
        action: "luffa.send_message",
        params: { body: "rest full" },
        idempotencyKey: "rest-full-invoke",
      },
    });
    const invoked = invoke.json() as { executionId: string; status: string };
    const execution = await app.inject({
      method: "GET",
      url: `/v1/executions/${invoked.executionId}`,
    });
    const feedback = await app.inject({
      method: "POST",
      url: `/v1/executions/${invoked.executionId}/feedback`,
      payload: { score: 4, comment: "solid" },
    });
    const reputation = await app.inject({
      method: "GET",
      url: `/v1/agents/${registered.agentId}/reputation`,
    });
    const balance = await app.inject({
      method: "GET",
      url: "/v1/accounts/did:luffa:user_rest_full/balance",
    });

    expect(register.statusCode).toBe(201);
    expect(registered.publicKey).toMatch(/^[a-f0-9]+$/);
    expect(registered.capabilities).toEqual(["luffa.send_message"]);
    expect(registered.profile.schemaVersion).toBe("1.0");
    expect(policy.statusCode).toBe(201);
    expect(invoke.statusCode).toBe(200);
    expect(invoked.status).toBe("SUCCESS");
    expect(execution.statusCode).toBe(200);
    expect(feedback.statusCode).toBe(201);
    expect((reputation.json() as { score: number }).score).toBeCloseTo(0.53);
    expect((balance.json() as { balance: number }).balance).toBe(7);
    await app.close();
  });

  it("runs MCP get_execution and submit_feedback tools", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.send_message");
    const { callTool } = createMcpTools(lael);
    const invokeResponse = await callTool("lael.invoke", {
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "mcp full" },
      idempotencyKey: "mcp-full-invoke",
    });
    const invoked = JSON.parse(invokeResponse.content[0]?.text ?? "{}") as {
      executionId: string;
    };
    const executionResponse = await callTool("lael.get_execution", {
      executionId: invoked.executionId,
    });
    const feedbackResponse = await callTool("lael.submit_feedback", {
      executionId: invoked.executionId,
      score: 5,
      comment: "mcp good",
    });

    expect(JSON.parse(executionResponse.content[0]?.text ?? "{}").executionId).toBe(
      invoked.executionId,
    );
    expect(JSON.parse(feedbackResponse.content[0]?.text ?? "{}").score).toBeCloseTo(0.55);
    lael.close();
  });

  it("prevents duplicate execution with idempotency keys", async () => {
    const { lael, agent } = await createAgentWithPolicy("luffa.send_message");
    const first = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "hello" },
      idempotencyKey: "same-key",
    });
    const second = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.send_message",
      params: { body: "hello again" },
      idempotencyKey: "same-key",
    });
    const count = lael.db.db
      .prepare("SELECT COUNT(*) AS total FROM execution_records")
      .get() as { total: number };

    expect(second.idempotent).toBe(true);
    expect(second.executionId).toBe(first.executionId);
    expect(count.total).toBe(1);
    lael.close();
  });

  it("scopes idempotency keys per agent", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const firstAgent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "idempotency-agent-one",
      ownerRef: "did:luffa:user_001",
      capabilities: ["luffa.send_message"],
    });
    const secondAgent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "idempotency-agent-two",
      ownerRef: "did:luffa:user_002",
      capabilities: ["luffa.send_message"],
    });
    await lael.createPolicy({
      ownerRef: firstAgent.ownerRef,
      jsonRules: { allowedActions: ["luffa.send_message"] },
    });
    await lael.createPolicy({
      ownerRef: secondAgent.ownerRef,
      jsonRules: { allowedActions: ["luffa.send_message"] },
    });

    const first = await lael.invoke({
      agentId: firstAgent.internalId,
      action: "luffa.send_message",
      params: { body: "from one" },
      idempotencyKey: "shared-key",
    });
    const second = await lael.invoke({
      agentId: secondAgent.internalId,
      action: "luffa.send_message",
      params: { body: "from two" },
      idempotencyKey: "shared-key",
    });

    expect(second.idempotent).toBeUndefined();
    expect(second.executionId).not.toBe(first.executionId);
    expect(second.agentId).toBe(secondAgent.internalId);
    lael.close();
  });

  it("connects, verifies, and lists a Phantom wallet binding", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const keypair = await lael.identity.generateKeypair();
    const pending = lael.connectWallet({
      ownerRef: "did:luffa:wallet_owner",
      walletType: WalletType.PHANTOM,
      chainType: "solana",
      address: keypair.publicKey,
    });
    const signature = await lael.identity.signMessage(
      keypair[`private${"Key"}`],
      pending.message,
    );
    const verified = await lael.verifyWallet({
      bindingId: pending.bindingId,
      ownerRef: pending.ownerRef,
      walletType: WalletType.PHANTOM,
      chainType: "solana",
      address: keypair.publicKey,
      nonce: pending.nonce,
      signature,
    });
    const wallets = lael.getWallets("did:luffa:wallet_owner");

    expect(verified.verified).toBe(true);
    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.address).toBe(keypair.publicKey);
    lael.close();
  });

  it("runs the REST v2 wallet binding flow for EVM wallets", async () => {
    const { app } = await buildServer({ path: ":memory:" });
    const address = "0x0000000000000000000000000000000000000abc";
    const connect = await app.inject({
      method: "POST",
      url: "/v2/wallet/connect",
      payload: {
        ownerRef: "did:luffa:evm_owner",
        walletType: WalletType.METAMASK,
        chainType: "evm",
        address,
      },
    });
    const pending = connect.json() as {
      bindingId: string;
      message: string;
      nonce: string;
      address: string;
    };
    const verify = await app.inject({
      method: "POST",
      url: "/v2/wallet/verify",
      payload: {
        bindingId: pending.bindingId,
        ownerRef: "did:luffa:evm_owner",
        walletType: WalletType.METAMASK,
        chainType: "evm",
        address,
        nonce: pending.nonce,
        signature: createDevWalletSignature(pending.message, pending.address),
      },
    });
    const wallets = await app.inject({
      method: "GET",
      url: "/v2/wallets/did:luffa:evm_owner",
    });

    expect(connect.statusCode).toBe(201);
    expect(verify.statusCode).toBe(200);
    expect((verify.json() as { verified: boolean }).verified).toBe(true);
    expect((wallets.json() as { wallets: unknown[] }).wallets).toHaveLength(1);
    await app.close();
  });

  it("settles EVM native and ERC20 transfers through adapters", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const native = await lael.transferSettlement({
      executionId: "exec_evm_native",
      payerDid: "did:luffa:payer",
      payeeDid: "did:luffa:payee",
      asset: "ETH",
      amount: 0.001,
      rail: "evm-native",
      chainKey: "BASE_SEPOLIA",
      walletAddress: "0x0000000000000000000000000000000000000001",
      toAddress: "0x0000000000000000000000000000000000000002",
      txHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      idempotencyKey: "evm-native-transfer",
    });
    const erc20 = await lael.transferSettlement({
      executionId: "exec_evm_erc20",
      payerDid: "did:luffa:payer",
      payeeDid: "did:luffa:payee",
      asset: "USDC",
      amount: 1.25,
      rail: "evm-erc20",
      chainKey: "BASE_SEPOLIA",
      walletAddress: "0x0000000000000000000000000000000000000001",
      toAddress: "0x0000000000000000000000000000000000000002",
      tokenAddress: "0x0000000000000000000000000000000000000003",
      txHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      idempotencyKey: "evm-erc20-transfer",
    });
    const repeated = await lael.transferSettlement({
      ...erc20,
      executionId: "exec_evm_erc20",
      payerDid: "did:luffa:payer",
      payeeDid: "did:luffa:payee",
      asset: "USDC",
      amount: 1.25,
      rail: "evm-erc20",
      idempotencyKey: "evm-erc20-transfer",
    });

    expect(native.status).toBe("COMPLETED");
    expect(native.chainType).toBe("evm");
    expect(native.gasUsed).toBe("21000");
    expect(erc20.status).toBe("COMPLETED");
    expect(erc20.txHash).toBe("0x2222222222222222222222222222222222222222222222222222222222222222");
    expect(repeated.settlementId).toBe(erc20.settlementId);
    lael.close();
  });

  it("settles Solana transfers and verifies transaction status", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const settlement = await lael.transferSettlement({
      executionId: "exec_solana",
      payerDid: "did:luffa:payer",
      payeeDid: "did:luffa:payee",
      asset: "SOL",
      amount: 0.01,
      rail: "solana-native",
      chainKey: "SOLANA_DEVNET",
      walletAddress: "So11111111111111111111111111111111111111112",
      toAddress: "So11111111111111111111111111111111111111113",
      txHash: "solana_mock_signature",
      idempotencyKey: "solana-transfer",
    });
    const verification = await lael.verifyTransaction(
      "solana_mock_signature",
      "solana",
      "devnet",
    );

    expect(settlement.status).toBe("COMPLETED");
    expect(settlement.chainType).toBe("solana");
    expect(verification.status).toBe("SUCCESS");
    lael.close();
  });

  it("writes chain settlement fields into execution records", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const walletAddress = "0x0000000000000000000000000000000000000001";
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "chain-execution-agent",
      ownerRef: "did:luffa:chain_owner",
      capabilities: ["luffa.create_task"],
    });
    await bindDevEvmWallet(lael, agent.ownerRef, walletAddress);
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      jsonRules: {
        allowedActions: ["luffa.create_task"],
        maxBudgetPerAction: 10,
        allowedAssets: ["USDC"],
        allowedChains: ["BASE_SEPOLIA"],
      },
    });

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: {
        communityId: "community_001",
        title: "Base Sepolia USDC settlement",
        settlement: {
          payerDid: agent.ownerRef,
          payeeDid: "did:luffa:payee",
          amount: 2,
          asset: "USDC",
          rail: "evm-erc20",
          chainKey: "BASE_SEPOLIA",
          walletAddress,
          toAddress: "0x0000000000000000000000000000000000000002",
          tokenAddress: "0x0000000000000000000000000000000000000003",
          txHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
        },
      },
      idempotencyKey: "chain-execution-settlement",
      context: { budget: 2 },
    });
    const record = lael.getExecutionRecord(result.executionId);

    expect(result.status).toBe("SUCCESS");
    expect(result.settlementStatus).toBe("COMPLETED");
    expect(record?.chainType).toBe("evm");
    expect(record?.chainId).toBe("84532");
    expect(record?.txHash).toBe("0x3333333333333333333333333333333333333333333333333333333333333333");
    lael.close();
  });

  it("denies chain switching outside policy", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "chain-switch-agent",
      ownerRef: "did:luffa:chain_policy_owner",
      capabilities: ["luffa.create_task"],
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      jsonRules: {
        allowedActions: ["luffa.create_task"],
        allowedAssets: ["USDC"],
        allowedChains: ["BASE_SEPOLIA"],
      },
    });

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: {
        title: "Wrong chain",
        settlement: {
          payerDid: agent.ownerRef,
          payeeDid: "did:luffa:payee",
          amount: 1,
          asset: "USDC",
          rail: "evm-erc20",
          chainKey: "POLYGON_AMOY",
        },
      },
      idempotencyKey: "chain-switch-deny",
    });

    expect(result.status).toBe("DENIED");
    expect(result.result.error).toBe("Chain denied by policy");
    lael.close();
  });

  it("enforces delegated capability settlement constraints", async () => {
    const lael = new LAEL({ path: ":memory:" });
    const agent = await lael.registerAgent({
      identityType: "API_KEY",
      externalId: "cap-settlement-agent",
      ownerRef: "did:luffa:cap_owner",
      capabilities: ["luffa.create_task"],
    });
    await lael.createPolicy({
      ownerRef: agent.ownerRef,
      jsonRules: { allowedActions: ["luffa.create_task"], maxBudgetPerAction: 10 },
    });
    const token = await lael.issueCapabilityToken({
      granteeDid: agent.internalId,
      scope: ["luffa.create_task"],
      constraints: {
        maxAmount: 1,
        allowedAssets: ["USDC"],
        allowedChains: ["BASE_SEPOLIA"],
      },
    });

    const result = await lael.invoke({
      agentId: agent.internalId,
      action: "luffa.create_task",
      params: {
        title: "Too much delegated spend",
        settlement: {
          payerDid: agent.ownerRef,
          payeeDid: "did:luffa:payee",
          amount: 2,
          asset: "USDC",
          rail: "evm-erc20",
          chainKey: "BASE_SEPOLIA",
        },
      },
      idempotencyKey: "cap-max-amount-deny",
      capabilityTokenId: token.tokenId,
    });

    expect(result.status).toBe("DENIED");
    expect(result.result.error).toBe("Capability token maxAmount exceeded");
    lael.close();
  });

  it("runs REST v2 settlement transfer and tx verification", async () => {
    const { app } = await buildServer({ path: ":memory:" });
    const transfer = await app.inject({
      method: "POST",
      url: "/v2/settlement/transfer",
      payload: {
        executionId: "exec_rest_v2_transfer",
        payerDid: "did:luffa:payer",
        payeeDid: "did:luffa:payee",
        asset: "USDC",
        amount: 3,
        rail: "evm-erc20",
        chainKey: "BASE_SEPOLIA",
        walletAddress: "0x0000000000000000000000000000000000000001",
        toAddress: "0x0000000000000000000000000000000000000002",
        tokenAddress: "0x0000000000000000000000000000000000000003",
        txHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
        idempotencyKey: "rest-v2-transfer",
      },
    });
    const body = transfer.json() as { txHash: string; status: string };
    const verification = await app.inject({
      method: "GET",
      url: `/v2/settlement/tx/${body.txHash}?chainType=evm&chainId=84532`,
    });

    expect(transfer.statusCode).toBe(201);
    expect(body.status).toBe("COMPLETED");
    expect((verification.json() as { status: string }).status).toBe("SUCCESS");
    await app.close();
  });
});
