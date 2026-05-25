import type { ExecutionAdapter, AdapterExecutionRequest, AdapterExecutionResult } from "./execution.adapter.ts";
import { assertRuntimeExecutionAuthorization, type RuntimeExecutionAuthorization } from "../runtime/execution.runner.ts";

export class OpenClawStubAdapter implements ExecutionAdapter {
  readonly name = "openclaw_stub";

  async execute(request: AdapterExecutionRequest, authorization: RuntimeExecutionAuthorization): Promise<AdapterExecutionResult> {
    assertRuntimeExecutionAuthorization(authorization);
    return {
      summary: "OpenClaw stub accepted the trusted execution request.",
      output: {
        adapter: this.name,
        workflow_id: request.workflow.workflow_id,
        simulated: true
      },
      compute_units: 1
    };
  }
}
