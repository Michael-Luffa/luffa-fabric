import type { FeedbackLabel } from "./feedback.resource.ts";
import type { RiskLevel } from "../security/risk.levels.ts";

export type LearningSignal = {
  kind: "LearningSignal";
  signal_id: string;
  receipt_id: string;
  feedback_id: string;
  agent_id: string;
  workflow_id: string;
  context_namespace: string;
  outcome: FeedbackLabel;
  quality_score: number;
  policy_result: string;
  risk_level: RiskLevel;
  created_at: string;
};
