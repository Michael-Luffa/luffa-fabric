import type { ExecutionAdapter, AdapterExecutionRequest, AdapterExecutionResult } from "./execution.adapter.ts";
import { assertRuntimeExecutionAuthorization, type RuntimeExecutionAuthorization } from "../runtime/execution.runner.ts";

export class LuffaStubAdapter implements ExecutionAdapter {
  readonly name = "luffa_stub";

  async execute(request: AdapterExecutionRequest, authorization: RuntimeExecutionAuthorization): Promise<AdapterExecutionResult> {
    assertRuntimeExecutionAuthorization(authorization);
    return {
      summary: "Luffa stub consumed identity, community, and event metadata without direct key access.",
      output: {
        adapter: this.name,
        agent_id: request.intent.agent_id,
        context_refs: request.intent.context_refs,
        simulated: true
      },
      compute_units: 1
    };
  }
}
