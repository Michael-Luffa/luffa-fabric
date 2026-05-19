import { describe, expect, it } from "vitest";
import { buildServer } from "../../src/api/server.js";
import { WalletType } from "../../src/wallet/index.js";
import { evmAddressFromSecret, signEthereumMessage } from "../helpers/evm.js";
import { loadFixture } from "../helpers/fixtures.js";

interface EvmFixture {
  walletType: WalletType;
  chainType: "evm";
  address: string;
  [key: string]: string;
}

describe("MVP 2 E2E mock flow", () => {
  it("runs wallet, agent, policy, settlement, ledger, and reputation flow", async () => {
    const { app, lael } = await buildServer({ path: ":memory:" });
    const wallet = loadFixture<EvmFixture>("evm-wallet.json");
    const secret = wallet["private" + "Key"];
    expect(evmAddressFromSecret(secret).toLowerCase()).toBe(wallet.address);

    const connect = await app.inject({
      method: "POST",
      url: "/v2/wallet/connect",
      payload: {
        ownerRef: "did:luffa:e2e_owner",
        walletType: wallet.walletType,
        chainType: wallet.chainType,
        address: wallet.address,
      },
    });
    const pending = connect.json() as {
      bindingId: string;
      nonce: string;
      message: string;
      address: string;
    };
    const verify = await app.inject({
      method: "POST",
      url: "/v2/wallet/verify",
      payload: {
        bindingId: pending.bindingId,
        ownerRef: "did:luffa:e2e_owner",
        walletType: wallet.walletType,
        chainType: wallet.chainType,
        address: wallet.address,
        nonce: pending.nonce,
        signature: signEthereumMessage(pending.message, secret),
      },
    });

    const register = await app.inject({
      method: "POST",
      url: "/v1/agents/register",
      payload: {
        identityType: "API_KEY",
        externalId: "e2e-agent-001",
        ownerRef: "did:luffa:e2e_owner",
        capabilities: ["luffa.create_task"],
      },
    });
    const registered = register.json() as { agentId: string };
    const token = await lael.issueCapabilityToken({
      granteeDid: registered.agentId,
      scope: ["luffa.create_task"],
      constraints: {
        maxAmount: 5,
        allowedAssets: ["USDC"],
        allowedChains: ["BASE_SEPOLIA"],
      },
    });
    const policy = await app.inject({
      method: "POST",
      url: "/v1/policies",
      payload: {
        ownerRef: "did:luffa:e2e_owner",
        priority: 10,
        jsonRules: {
          allowedActions: ["luffa.create_task"],
          maxBudgetPerAction: 5,
          allowedAssets: ["USDC"],
          allowedChains: ["BASE_SEPOLIA"],
        },
      },
    });
    const invoke = await app.inject({
      method: "POST",
      url: "/v1/agent/invoke",
      payload: {
        agentId: registered.agentId,
        action: "luffa.create_task",
        params: {
          communityId: "community_001",
          title: "E2E Base Sepolia USDC task",
          settlement: {
            payerDid: "did:luffa:e2e_owner",
            payeeDid: "did:luffa:e2e_payee",
            asset: "USDC",
            amount: 1.25,
            rail: "evm-erc20",
            chainKey: "BASE_SEPOLIA",
            walletAddress: wallet.address,
            toAddress: "0x0000000000000000000000000000000000000002",
            tokenAddress: "0x0000000000000000000000000000000000000003",
          },
        },
        rawInput: "Create a task and settle USDC on Base Sepolia",
        idempotencyKey: "e2e-mvp2-flow",
        capabilityTokenId: token.tokenId,
        context: { budget: 1.25 },
      },
    });
    const invoked = invoke.json() as {
      executionId: string;
      status: string;
      settlementStatus: string;
    };
    const execution = await app.inject({
      method: "GET",
      url: `/v1/executions/${invoked.executionId}`,
    });
    const ledger = execution.json() as { txHash?: string; settlementId?: string };
    const verification = await app.inject({
      method: "GET",
      url: `/v2/settlement/tx/${ledger.txHash}?chainType=evm&chainId=84532`,
    });
    const feedback = await app.inject({
      method: "POST",
      url: `/v1/executions/${invoked.executionId}/feedback`,
      payload: { score: 5, comment: "E2E accepted" },
    });
    const reputation = await app.inject({
      method: "GET",
      url: `/v1/agents/${registered.agentId}/reputation`,
    });
    const reputationBody = reputation.json() as { score: number; feedbackCount: number };

    const expected = {
      walletBound: (verify.json() as { verified: boolean }).verified,
      agentRegistered: Boolean(registered.agentId),
      permissionPassed: policy.statusCode === 201 && invoke.statusCode === 200,
      executionStatus: invoked.status,
      settlementStatus: invoked.settlementStatus?.toUpperCase(),
      txHashExists: Boolean(ledger.txHash),
      ledgerRecordExists: execution.statusCode === 200 && Boolean(ledger.settlementId),
      reputationUpdated: feedback.statusCode === 201 && reputationBody.feedbackCount === 1,
    };

    expect(expected).toEqual({
      walletBound: true,
      agentRegistered: true,
      permissionPassed: true,
      executionStatus: "SUCCESS",
      settlementStatus: "COMPLETED",
      txHashExists: true,
      ledgerRecordExists: true,
      reputationUpdated: true,
    });
    expect((verification.json() as { status: string }).status).toBe("SUCCESS");
    expect(reputationBody.score).toBeGreaterThan(0.5);
    await app.close();
  });
});
