import { FeedbackProcessor } from "../../../core/src/runtime/feedback.processor.ts";
import { LearningSignalEmitter } from "../../../core/src/runtime/learning.signal.emitter.ts";
import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { readResourceFile, printJson } from "./io.ts";

export async function handleFeedbackCommand(args: string[], repositories: LaelRepositories): Promise<boolean> {
  const [command, value] = args;
  if (command === "submit" && value) {
    const processor = new FeedbackProcessor(
      repositories.feedback,
      repositories.receipts,
      new LearningSignalEmitter(repositories.learningSignals, repositories.contexts)
    );
    const result = await processor.submit(await readResourceFile(value));
    printJson(result);
    console.log(`Feedback accepted: ${result.ok ? "yes" : "no"}`);
    console.log(`Learning signal emitted: ${result.ok ? "yes" : "no"}`);
    return true;
  }
  return false;
}
