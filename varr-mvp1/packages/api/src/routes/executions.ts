import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { parseWith } from "../../../core/src/schemas/index.ts";
import { validateExecutionIntent } from "../../../core/src/resources/execution-intent.resource.ts";
import { RuntimeOrchestrator } from "../../../core/src/runtime/runtime.orchestrator.ts";

export async function handleExecutionRoute(method: string, parts: string[], body: unknown, repositories: LaelRepositories): Promise<unknown | undefined> {
  if (method === "POST" && parts.length === 3 && parts[2] === "intents") {
    return parseWith("ExecutionIntent", body, validateExecutionIntent);
  }
  if (method === "POST" && parts.length === 3 && parts[2] === "run") {
    return new RuntimeOrchestrator({ repositories }).run(body);
  }
  if (method === "GET" && parts.length === 4 && parts[2] === "receipts") {
    return repositories.receipts.get(decodeURIComponent(parts[3]));
  }
  return undefined;
}
