export type ResourceKind =
  | "AgentResource"
  | "CapabilityGrant"
  | "ContextResource"
  | "WorkflowResource"
  | "ExecutionIntent"
  | "ExecutionReceipt"
  | "FeedbackResource"
  | "LearningSignal";

export type JsonResource = Record<string, unknown> & {
  kind: ResourceKind;
};
