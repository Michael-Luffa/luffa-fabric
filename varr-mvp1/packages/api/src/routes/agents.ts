import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { parseWith } from "../../../core/src/schemas/index.ts";
import { validateAgentPatch, validateAgentResource } from "../../../core/src/resources/agent.resource.ts";

export async function handleAgentRoute(method: string, parts: string[], body: unknown, repositories: LaelRepositories): Promise<unknown | undefined> {
  if (method === "POST" && parts.length === 2) {
    return repositories.agents.create(parseWith("AgentResource", body, validateAgentResource));
  }
  if (method === "GET" && parts.length === 3) {
    return repositories.agents.get(decodeURIComponent(parts[2]));
  }
  if (method === "PATCH" && parts.length === 3) {
    return repositories.agents.update(decodeURIComponent(parts[2]), parseWith("AgentPatch", body, validateAgentPatch));
  }
  if (method === "POST" && parts.length === 4 && parts[3] === "suspend") {
    return repositories.agents.suspend(decodeURIComponent(parts[2]));
  }
  return undefined;
}
