import { parseWith } from "../../../core/src/schemas/index.ts";
import { validateAgentResource } from "../../../core/src/resources/agent.resource.ts";
import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { readResourceFile, printJson } from "./io.ts";

export async function handleAgentCommand(args: string[], repositories: LaelRepositories): Promise<boolean> {
  const [command, value] = args;
  if (command === "register" && value) {
    const agent = parseWith("AgentResource", await readResourceFile(value), validateAgentResource);
    printJson(await repositories.agents.create(agent));
    return true;
  }
  if (command === "get" && value) {
    printJson(await repositories.agents.get(value));
    return true;
  }
  return false;
}
