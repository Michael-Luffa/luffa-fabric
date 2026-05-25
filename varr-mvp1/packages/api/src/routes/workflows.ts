import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { parseWith } from "../../../core/src/schemas/index.ts";
import { validateWorkflowResource } from "../../../core/src/resources/workflow.resource.ts";

export async function handleWorkflowRoute(method: string, parts: string[], body: unknown, repositories: LaelRepositories): Promise<unknown | undefined> {
  if (method === "POST" && parts.length === 2) {
    return repositories.workflows.create(parseWith("WorkflowResource", body, validateWorkflowResource));
  }
  if (method === "GET" && parts.length === 3) {
    return repositories.workflows.get(decodeURIComponent(parts[2]));
  }
  return undefined;
}
