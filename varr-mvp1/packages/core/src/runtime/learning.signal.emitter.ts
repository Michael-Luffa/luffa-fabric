import type { ExecutionReceipt } from "../evidence/execution.receipt.ts";
import type { FeedbackResource } from "../resources/feedback.resource.ts";
import type { LearningSignal } from "../resources/learning-signal.resource.ts";
import type { ContextRepository, LearningSignalRepository } from "../storage/repository.interface.ts";
import { nextId } from "./receipt.generator.ts";

export class LearningSignalEmitter {
  private readonly signals: LearningSignalRepository;
  private readonly contexts: ContextRepository;

  constructor(signals: LearningSignalRepository, contexts: ContextRepository) {
    this.signals = signals;
    this.contexts = contexts;
  }

  async emit(receipt: ExecutionReceipt, feedback: FeedbackResource): Promise<LearningSignal> {
    const existing = await this.signals.list();
    const context = receipt.context_refs[0] ? await this.contexts.get(receipt.context_refs[0]) : undefined;
    const signal: LearningSignal = {
      kind: "LearningSignal",
      signal_id: nextId("learn", existing.length + 1),
      receipt_id: receipt.receipt_id,
      feedback_id: feedback.feedback_id,
      agent_id: receipt.agent_id,
      workflow_id: receipt.workflow_id,
      context_namespace: context?.namespace ?? "unknown",
      outcome: feedback.label,
      quality_score: feedback.score,
      policy_result: receipt.status === "success" ? "allowed" : receipt.status,
      risk_level: receipt.risk.level,
      created_at: new Date().toISOString()
    };

    return this.signals.create(signal);
  }
}
