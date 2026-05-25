import type { ExecutionAdapter, AdapterExecutionRequest, AdapterExecutionResult } from "./execution.adapter.ts";
import { assertRuntimeExecutionAuthorization, type RuntimeExecutionAuthorization } from "../runtime/execution.runner.ts";

export class MockExecutionAdapter implements ExecutionAdapter {
  readonly name = "mock";
  executionCount = 0;

  async execute(request: AdapterExecutionRequest, authorization: RuntimeExecutionAuthorization): Promise<AdapterExecutionResult> {
    assertRuntimeExecutionAuthorization(authorization);
    this.executionCount += 1;
    const namespaces = request.contexts.map((context) => context.namespace).join(", ");
    return {
      summary: `Generated a summary draft for ${namespaces}.`,
      output: {
        draft: "Public channel summary: community updates were condensed into a concise operator-ready draft.",
        actions: request.actions,
        context_refs: request.intent.context_refs
      },
      compute_units: 1
    };
  }
}
