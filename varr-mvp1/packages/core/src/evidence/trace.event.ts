export type TraceEvent = {
  event_id: string;
  receipt_id?: string;
  type: "runtime_check" | "adapter_execution" | "security_denial" | "approval_pending" | "feedback" | "learning_signal";
  message: string;
  created_at: string;
};
