import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { parseWith } from "../../../core/src/schemas/index.ts";
import { validateContextResource } from "../../../core/src/resources/context.resource.ts";

export async function handleContextRoute(method: string, parts: string[], body: unknown, repositories: LaelRepositories): Promise<unknown | undefined> {
  if (method === "POST" && parts.length === 2) {
    return repositories.contexts.create(parseWith("ContextResource", body, validateContextResource));
  }
  if (method === "GET" && parts.length === 3) {
    return repositories.contexts.get(decodeURIComponent(parts[2]));
  }
  return undefined;
}
