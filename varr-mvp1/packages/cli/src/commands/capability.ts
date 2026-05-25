import { parseWith } from "../../../core/src/schemas/index.ts";
import { validateCapabilityGrant } from "../../../core/src/resources/capability.resource.ts";
import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { readResourceFile, printJson } from "./io.ts";

export async function handleCapabilityCommand(args: string[], repositories: LaelRepositories): Promise<boolean> {
  const [command, value] = args;
  if (command === "grant" && value) {
    const capability = parseWith("CapabilityGrant", await readResourceFile(value), validateCapabilityGrant);
    if (!(await repositories.agents.get(capability.subject))) {
      throw new Error(`subject agent not found: ${capability.subject}`);
    }
    printJson(await repositories.capabilities.create(capability));
    return true;
  }
  if (command === "revoke" && value) {
    printJson(await repositories.capabilities.revoke(value));
    return true;
  }
  return false;
}
