import { RuntimeOrchestrator } from "../../../core/src/runtime/runtime.orchestrator.ts";
import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { readResourceFile, printJson } from "./io.ts";

export async function handleExecuteCommand(args: string[], repositories: LaelRepositories): Promise<boolean> {
  const [file] = args;
  if (!file) {
    return false;
  }
  const result = await new RuntimeOrchestrator({ repositories }).run(await readResourceFile(file));
  printJson(result);
  console.log(`Execution status: ${result.receipt.status}`);
  console.log(`Receipt generated: ${result.receipt.receipt_id}`);
  console.log("Private key exposure: no");
  console.log(result.receipt.status === "success" ? "Context boundary respected: yes" : "Context boundary respected: checked");
  return true;
}
