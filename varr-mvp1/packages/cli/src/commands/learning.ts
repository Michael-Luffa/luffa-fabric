import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { printJson } from "./io.ts";

export async function handleLearningCommand(args: string[], repositories: LaelRepositories): Promise<boolean> {
  const [command, flag, value] = args;
  if (command === "signal" && flag === "--receipt" && value) {
    printJson(await repositories.learningSignals.listByReceipt(value));
    return true;
  }
  return false;
}
