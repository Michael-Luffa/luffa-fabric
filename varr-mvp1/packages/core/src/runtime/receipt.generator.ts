import { createHash } from "node:crypto";
import type { ExecutionIntent } from "../resources/execution-intent.resource.ts";
import type { ContextResource } from "../resources/context.resource.ts";
import type { ExecutionReceipt, ExecutionStatus } from "../evidence/execution.receipt.ts";
import type { ReceiptRepository } from "../storage/repository.interface.ts";
import { stableStringify } from "../schemas/index.ts";
import type { PolicyDecision, RiskLevel } from "../security/risk.levels.ts";

export type ReceiptInput = {
  intent: ExecutionIntent;
  capability_ids: string[];
  contexts: ContextResource[];
  policy_decisions: PolicyDecision[];
  risk: {
    level: RiskLevel;
    approval_required: boolean;
  };
  status: ExecutionStatus;
  summary: string;
  output?: unknown;
  compute_units?: number;
};

export class ReceiptGenerator {
  private readonly receipts: ReceiptRepository;

  constructor(receipts: ReceiptRepository) {
    this.receipts = receipts;
  }

  async generate(input: ReceiptInput): Promise<ExecutionReceipt> {
    const existing = await this.receipts.list();
    const receipt: ExecutionReceipt = {
      kind: "ExecutionReceipt",
      version: "1.0",
      receipt_id: nextId("receipt", existing.length + 1),
      intent_id: input.intent.intent_id,
      agent_id: input.intent.agent_id,
      workflow_id: input.intent.workflow_id,
      capability_ids: input.capability_ids,
      context_refs: input.intent.context_refs,
      context_hash: hashValue(input.contexts.map((context) => ({
        context_id: context.context_id,
        namespace: context.namespace,
        scope: context.scope,
        data_sources: context.data_sources
      }))),
      policy_decisions: input.policy_decisions,
      risk: input.risk,
      status: input.status,
      summary: input.summary,
      output_ref: hashValue(input.output ?? input.summary),
      cost: {
        compute_units: input.compute_units ?? 0,
        amount_usd: 0
      },
      created_at: new Date().toISOString()
    };

    return this.receipts.create(receipt);
  }
}

export function hashValue(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

export function nextId(prefix: string, nextNumber: number): string {
  return `${prefix}_${String(nextNumber).padStart(3, "0")}`;
}
