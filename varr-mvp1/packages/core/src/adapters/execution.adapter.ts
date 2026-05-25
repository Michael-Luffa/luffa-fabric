import type { ExecutionIntent } from "../resources/execution-intent.resource.ts";
import type { WorkflowResource } from "../resources/workflow.resource.ts";
import type { ContextResource } from "../resources/context.resource.ts";
import type { RuntimeExecutionAuthorization } from "../runtime/execution.runner.ts";

export type AdapterExecutionRequest = {
  intent: ExecutionIntent;
  workflow: WorkflowResource;
  contexts: ContextResource[];
  actions: string[];
};

export type AdapterExecutionResult = {
  summary: string;
  output: Record<string, unknown>;
  compute_units: number;
};

export interface ExecutionAdapter {
  readonly name: string;
  execute(request: AdapterExecutionRequest, authorization: RuntimeExecutionAuthorization): Promise<AdapterExecutionResult>;
}
