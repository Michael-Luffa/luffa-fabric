import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { FeedbackProcessor } from "../../../core/src/runtime/feedback.processor.ts";
import { LearningSignalEmitter } from "../../../core/src/runtime/learning.signal.emitter.ts";

export async function handleFeedbackRoute(method: string, parts: string[], body: unknown, repositories: LaelRepositories): Promise<unknown | undefined> {
  if (method === "POST" && parts.length === 2) {
    const processor = new FeedbackProcessor(
      repositories.feedback,
      repositories.receipts,
      new LearningSignalEmitter(repositories.learningSignals, repositories.contexts)
    );
    return processor.submit(body);
  }
  if (method === "GET" && parts.length === 3) {
    return repositories.feedback.get(decodeURIComponent(parts[2]));
  }
  return undefined;
}
