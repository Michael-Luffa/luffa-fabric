export function createOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "LAEL VARR MVP1 API",
      version: "1.0.0"
    },
    paths: {
      "/v1/agents": { post: { summary: "Register AgentResource" } },
      "/v1/agents/{agent_id}": { get: { summary: "Get AgentResource" }, patch: { summary: "Patch AgentResource" } },
      "/v1/agents/{agent_id}/suspend": { post: { summary: "Suspend AgentResource" } },
      "/v1/capabilities": { post: { summary: "Create CapabilityGrant" } },
      "/v1/capabilities/{capability_id}": { get: { summary: "Get CapabilityGrant" } },
      "/v1/capabilities/{capability_id}/revoke": { post: { summary: "Revoke CapabilityGrant" } },
      "/v1/contexts": { post: { summary: "Create ContextResource" } },
      "/v1/contexts/{context_id}": { get: { summary: "Get ContextResource" } },
      "/v1/workflows": { post: { summary: "Create WorkflowResource" } },
      "/v1/workflows/{workflow_id}": { get: { summary: "Get WorkflowResource" } },
      "/v1/execution/intents": { post: { summary: "Validate ExecutionIntent" } },
      "/v1/execution/run": { post: { summary: "Run trusted execution loop" } },
      "/v1/execution/receipts/{receipt_id}": { get: { summary: "Get ExecutionReceipt" } },
      "/v1/feedback": { post: { summary: "Submit FeedbackResource" } },
      "/v1/feedback/{feedback_id}": { get: { summary: "Get FeedbackResource" } },
      "/v1/learning/signals": { get: { summary: "List LearningSignal by receipt_id" } },
      "/v1/learning/signals/{signal_id}": { get: { summary: "Get LearningSignal" } }
    }
  };
}
