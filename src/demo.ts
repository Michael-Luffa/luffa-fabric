import { LAEL } from "./core/index.js";

async function main(): Promise<void> {
  const lael = new LAEL({ path: ":memory:" });

  const agent = await lael.registerAgent({
    identityType: "API_KEY",
    externalId: "openclaw-agent-001",
    ownerRef: "did:luffa:user_001",
    capabilities: ["luffa.create_task", "luffa.query_wallet", "luffa.send_message"],
  });

  const payee = await lael.registerAgent({
    identityType: "SERVICE_ACCOUNT",
    externalId: "task-reward-recipient-001",
    ownerRef: "did:luffa:user_002",
    capabilities: ["luffa.query_wallet"],
  });

  await lael.createPolicy({
    ownerRef: agent.ownerRef,
    version: "v0",
    priority: 10,
    jsonRules: {
      allowedActions: ["luffa.create_task"],
      maxBudgetPerAction: 5,
    },
  });

  const token = await lael.issueCapabilityToken({
    granteeDid: agent.internalId,
    scope: ["luffa.create_task"],
  });

  lael.settlement.createAccount(agent.ownerRef, "LUFFA_POINTS");
  lael.settlement.credit(agent.ownerRef, "LUFFA_POINTS", 25);

  const invocation = await lael.invoke({
    agentId: agent.internalId,
    action: "luffa.create_task",
    params: {
      communityId: "community_001",
      title: "Invite 10 new members",
      settlement: {
        payerDid: agent.ownerRef,
        payeeDid: payee.ownerRef,
        amount: 2.5,
      },
    },
    rawInput: "Create a task for my community",
    idempotencyKey: "demo-create-task-001",
    capabilityTokenId: token.tokenId,
    context: { budget: 2.5 },
  });

  const reputation = lael.submitFeedback(invocation.executionId, 5, "Good result");

  const output = {
    agents: [
      { agentId: agent.internalId, ownerRef: agent.ownerRef },
      { agentId: payee.internalId, ownerRef: payee.ownerRef },
    ],
    invocation: {
      executionId: invocation.executionId,
      status: invocation.status,
      settlementStatus: invocation.settlementStatus,
      merkleRoot: invocation.merkleRoot,
      result: invocation.result,
    },
    balances: {
      payer: lael.settlement.getBalance(agent.ownerRef, "LUFFA_POINTS"),
      payee: lael.settlement.getBalance(payee.ownerRef, "LUFFA_POINTS"),
    },
    reputation,
  };

  console.log(JSON.stringify(output, null, 2));
  lael.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

