import type { RiskLevel, PolicyDecision } from "../security/risk.levels.ts";

export type ExecutionStatus = "success" | "failed" | "rejected" | "pending_approval" | "denied";

export type ExecutionReceipt = {
  kind: "ExecutionReceipt";
  version: "1.0";
  receipt_id: string;
  intent_id: string;
  agent_id: string;
  workflow_id: string;
  capability_ids: string[];
  context_refs: string[];
  context_hash: string;
  policy_decisions: PolicyDecision[];
  risk: {
    level: RiskLevel;
    approval_required: boolean;
  };
  status: ExecutionStatus;
  summary: string;
  output_ref: string;
  cost: {
    compute_units: number;
    amount_usd: number;
  };
  created_at: string;
};
