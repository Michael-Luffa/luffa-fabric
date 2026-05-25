import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { parseWith } from "../../../core/src/schemas/index.ts";
import { validateCapabilityGrant } from "../../../core/src/resources/capability.resource.ts";

export async function handleCapabilityRoute(method: string, parts: string[], body: unknown, repositories: LaelRepositories): Promise<unknown | undefined> {
  if (method === "POST" && parts.length === 2) {
    const capability = parseWith("CapabilityGrant", body, validateCapabilityGrant);
    const agent = await repositories.agents.get(capability.subject);
    if (!agent) {
      throw new Error(`subject agent not found: ${capability.subject}`);
    }
    return repositories.capabilities.create(capability);
  }
  if (method === "GET" && parts.length === 3) {
    return repositories.capabilities.get(decodeURIComponent(parts[2]));
  }
  if (method === "POST" && parts.length === 4 && parts[3] === "revoke") {
    return repositories.capabilities.revoke(decodeURIComponent(parts[2]));
  }
  return undefined;
}
