import type { ExecutionAdapter, AdapterExecutionRequest, AdapterExecutionResult } from "../adapters/execution.adapter.ts";

const authorizedRuntimeTokens = new WeakSet<object>();

export type RuntimeExecutionAuthorization = object;

function createRuntimeExecutionAuthorization(): RuntimeExecutionAuthorization {
  const token = Object.freeze({});
  authorizedRuntimeTokens.add(token);
  return token;
}

export function assertRuntimeExecutionAuthorization(token: RuntimeExecutionAuthorization | undefined): void {
  if (!token || !authorizedRuntimeTokens.has(token)) {
    throw new Error("Adapter execution requires RuntimeOrchestrator authorization");
  }
}

export class ExecutionRunner {
  async run(adapter: ExecutionAdapter, request: AdapterExecutionRequest): Promise<AdapterExecutionResult> {
    const authorization = createRuntimeExecutionAuthorization();
    return adapter.execute(request, authorization);
  }
}
