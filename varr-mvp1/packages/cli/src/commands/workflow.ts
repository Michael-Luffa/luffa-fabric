import { parseWith } from "../../../core/src/schemas/index.ts";
import { validateWorkflowResource } from "../../../core/src/resources/workflow.resource.ts";
import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { readResourceFile, printJson } from "./io.ts";

export async function handleWorkflowCommand(args: string[], repositories: LaelRepositories): Promise<boolean> {
  const [command, value] = args;
  if (command === "create" && value) {
    const workflow = parseWith("WorkflowResource", await readResourceFile(value), validateWorkflowResource);
    printJson(await repositories.workflows.create(workflow));
    return true;
  }
  if (command === "get" && value) {
    printJson(await repositories.workflows.get(value));
    return true;
  }
  return false;
}
