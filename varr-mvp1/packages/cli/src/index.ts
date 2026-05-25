import { handleAgentCommand } from "./commands/agent.ts";
import { handleCapabilityCommand } from "./commands/capability.ts";
import { handleContextCommand } from "./commands/context.ts";
import { handleWorkflowCommand } from "./commands/workflow.ts";
import { handleExecuteCommand } from "./commands/execute.ts";
import { handleReceiptCommand } from "./commands/receipt.ts";
import { handleFeedbackCommand } from "./commands/feedback.ts";
import { handleLearningCommand } from "./commands/learning.ts";
import { currentStatePath, initWorkspace, loadRepositories, saveRepositories } from "./commands/workspace.ts";

async function main(argv: string[]): Promise<void> {
  const [resource, ...args] = argv;

  if (resource === "init") {
    const path = await initWorkspace();
    console.log(`Initialized LAEL MVP1 state at ${path}`);
    return;
  }

  const repositories = await loadRepositories();
  let handled = false;

  if (resource === "agent") {
    handled = await handleAgentCommand(args, repositories);
  } else if (resource === "capability") {
    handled = await handleCapabilityCommand(args, repositories);
  } else if (resource === "context") {
    handled = await handleContextCommand(args, repositories);
  } else if (resource === "workflow") {
    handled = await handleWorkflowCommand(args, repositories);
  } else if (resource === "execute") {
    handled = await handleExecuteCommand(args, repositories);
  } else if (resource === "receipt") {
    handled = await handleReceiptCommand(args, repositories);
  } else if (resource === "feedback") {
    handled = await handleFeedbackCommand(args, repositories);
  } else if (resource === "learning") {
    handled = await handleLearningCommand(args, repositories);
  }

  if (!handled) {
    throw new Error(`Unknown command. State: ${currentStatePath()}`);
  }

  await saveRepositories(repositories);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
