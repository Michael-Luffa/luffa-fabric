import type { FeedbackResource } from "../resources/feedback.resource.ts";
import { validateFeedbackResource } from "../resources/feedback.resource.ts";
import type { FeedbackRepository, ReceiptRepository } from "../storage/repository.interface.ts";
import { parseWith } from "../schemas/index.ts";
import type { LearningSignal } from "../resources/learning-signal.resource.ts";
import { LearningSignalEmitter } from "./learning.signal.emitter.ts";

export type FeedbackResult =
  | { ok: true; feedback: FeedbackResource; learning_signal: LearningSignal }
  | { ok: false; reason: string };

export class FeedbackProcessor {
  private readonly feedback: FeedbackRepository;
  private readonly receipts: ReceiptRepository;
  private readonly learningEmitter: LearningSignalEmitter;

  constructor(feedback: FeedbackRepository, receipts: ReceiptRepository, learningEmitter: LearningSignalEmitter) {
    this.feedback = feedback;
    this.receipts = receipts;
    this.learningEmitter = learningEmitter;
  }

  async submit(input: unknown): Promise<FeedbackResult> {
    const feedback = parseWith("FeedbackResource", input, validateFeedbackResource);
    const receipt = await this.receipts.get(feedback.receipt_id);
    if (!receipt) {
      return { ok: false, reason: "receipt_not_found" };
    }

    const storedFeedback = await this.feedback.create(feedback);
    const learningSignal = await this.learningEmitter.emit(receipt, storedFeedback);
    return { ok: true, feedback: storedFeedback, learning_signal: learningSignal };
  }
}
