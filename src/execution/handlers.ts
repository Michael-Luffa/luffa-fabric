import type { ExecutionHandler } from "./types.js";

export const builtInHandlers: Record<string, ExecutionHandler> = {
  "luffa.send_message": (request) => ({
    type: "message",
    status: "sent",
    messageId: `msg_${request.executionId ?? request.idempotencyKey}`,
    targetDid: request.targetDid,
    body: request.params.body ?? request.params.message ?? "",
  }),

  "luffa.create_task": (request) => ({
    type: "task",
    status: "created",
    taskId: `task_${request.executionId ?? request.idempotencyKey}`,
    communityId: request.params.communityId,
    title: request.params.title,
  }),

  "luffa.reward_user": (request) => ({
    type: "reward",
    status: "queued",
    payeeDid: request.params.payeeDid,
    amount: request.params.amount,
    asset: "LUFFA_POINTS",
  }),

  "luffa.query_wallet": (request) => ({
    type: "wallet_query",
    status: "ok",
    did: request.params.did ?? request.targetDid,
    asset: request.params.asset ?? "LUFFA_POINTS",
  }),

  "luffa.trigger_payment": (request) => ({
    type: "payment",
    status: "queued",
    payerDid: request.params.payerDid,
    payeeDid: request.params.payeeDid,
    amount: request.params.amount,
    asset: "LUFFA_POINTS",
  }),
};

