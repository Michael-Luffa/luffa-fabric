import type { FastifyInstance } from "fastify";
import type { LAEL } from "../core/index.js";
import type { ExecutionRequest } from "../execution/types.js";
import type { RegisterAgentInput, UpdateAgentMetadataInput } from "../identity/types.js";
import type { CreatePolicyInput } from "../permission/types.js";
import type { SettlementInstruction } from "../settlement/types.js";
import type { ConnectWalletInput, VerifyWalletInput } from "../wallet/index.js";

export async function registerRoutes(app: FastifyInstance, lael: LAEL): Promise<void> {
  app.post("/v1/agents/register", async (request, reply) => {
    const agent = await lael.registerAgent(request.body as RegisterAgentInput);
    return reply.code(201).send({
      agentId: agent.internalId,
      status: agent.status,
      capabilities: agent.capabilities,
      publicKey: agent.publicKey,
      profile: agent,
    });
  });

  app.get("/v1/agents/:agentId", async (request, reply) => {
    const params = request.params as { agentId: string };
    try {
      return await lael.resolveAgent(params.agentId);
    } catch {
      return reply.code(404).send({ error: "Agent not found" });
    }
  });

  app.patch("/v1/agents/:agentId/metadata", async (request, reply) => {
    const params = request.params as { agentId: string };
    try {
      return await lael.updateAgentMetadata(
        params.agentId,
        request.body as UpdateAgentMetadataInput,
      );
    } catch {
      return reply.code(404).send({ error: "Agent not found" });
    }
  });

  app.post("/v1/agents/:agentId/deactivate", async (request, reply) => {
    const params = request.params as { agentId: string };
    try {
      return await lael.deactivateAgent(params.agentId);
    } catch {
      return reply.code(404).send({ error: "Agent not found" });
    }
  });

  app.post("/v1/policies", async (request, reply) => {
    const policy = await lael.createPolicy(request.body as CreatePolicyInput);
    return reply.code(201).send(policy);
  });

  app.post("/v1/agent/invoke", async (request) => {
    const result = await lael.invoke(request.body as ExecutionRequest);
    return {
      executionId: result.executionId,
      status: result.status,
      result: result.result,
      settlementStatus: result.settlementStatus?.toLowerCase(),
      merkleRoot: result.merkleRoot,
      idempotent: result.idempotent ?? false,
    };
  });

  app.get("/v1/executions/:executionId", async (request, reply) => {
    const params = request.params as { executionId: string };
    const record = lael.getExecutionRecord(params.executionId);
    if (!record) {
      return reply.code(404).send({ error: "Execution not found" });
    }
    return record;
  });

  app.post("/v1/executions/:executionId/feedback", async (request, reply) => {
    const params = request.params as { executionId: string };
    const body = request.body as { score: number; comment?: string };
    const reputation = lael.submitFeedback(params.executionId, body.score, body.comment);
    return reply.code(201).send(reputation);
  });

  app.get("/v1/agents/:agentId/reputation", async (request) => {
    const params = request.params as { agentId: string };
    return lael.getReputation(params.agentId);
  });

  app.get("/v1/accounts/:did/balance", async (request) => {
    const params = request.params as { did: string };
    return {
      did: params.did,
      asset: "LUFFA_POINTS",
      balance: lael.getBalance(params.did),
    };
  });

  app.get("/v2/chains", async () => ({
    chains: lael.getSupportedChains(),
  }));

  app.post("/v2/wallet/connect", async (request, reply) => {
    try {
      return reply.code(201).send(lael.connectWallet(request.body as ConnectWalletInput));
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Wallet connect failed",
      });
    }
  });

  app.post("/v2/wallet/verify", async (request, reply) => {
    try {
      const binding = await lael.verifyWallet(request.body as VerifyWalletInput);
      return reply.code(binding.verified ? 200 : 400).send(binding);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Wallet verification failed",
      });
    }
  });

  app.get("/v2/wallets/:ownerRef", async (request) => {
    const params = request.params as { ownerRef: string };
    return { ownerRef: params.ownerRef, wallets: lael.getWallets(params.ownerRef) };
  });

  app.post("/v2/settlement/transfer", async (request, reply) => {
    try {
      const settlement = await lael.transferSettlement(
        request.body as SettlementInstruction & { idempotencyKey?: string },
      );
      return reply.code(settlement.status === "ROLLED_BACK" ? 409 : 201).send(settlement);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Settlement transfer failed",
      });
    }
  });

  app.get("/v2/settlement/tx/:txHash", async (request, reply) => {
    const params = request.params as { txHash: string };
    const query = request.query as { chainType?: SettlementInstruction["chainType"]; chainId?: string };
    try {
      return await lael.verifyTransaction(params.txHash, query.chainType, query.chainId);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Transaction verification failed",
      });
    }
  });
}
