import { parseWith } from "../../../core/src/schemas/index.ts";
import { validateContextResource } from "../../../core/src/resources/context.resource.ts";
import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { readResourceFile, printJson } from "./io.ts";

export async function handleContextCommand(args: string[], repositories: LaelRepositories): Promise<boolean> {
  const [command, value] = args;
  if (command === "create" && value) {
    const context = parseWith("ContextResource", await readResourceFile(value), validateContextResource);
    printJson(await repositories.contexts.create(context));
    return true;
  }
  if (command === "get" && value) {
    printJson(await repositories.contexts.get(value));
    return true;
  }
  return false;
}
