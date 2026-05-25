import { isForbiddenAction } from "../security/forbidden.actions.ts";
import { maxRisk, type PolicyDecision, type RiskLevel } from "../security/risk.levels.ts";

const mediumRiskActions = new Set(["internal_post", "external_api_call"]);
const highRiskActions = new Set(["publish", "external_share", "publish_external", "payment_intent", "large_data_access"]);

export type RiskClassification = {
  level: RiskLevel;
  action_risks: Record<string, RiskLevel>;
  decisions: PolicyDecision[];
};

export class RiskClassifier {
  classify(actions: string[]): RiskClassification {
    const action_risks: Record<string, RiskLevel> = {};
    const decisions: PolicyDecision[] = [];

    for (const action of actions) {
      const level = classifyAction(action);
      action_risks[action] = level;
      decisions.push({
        action,
        decision: level === "critical" ? "deny" : level === "high" ? "pending_approval" : "allow",
        reason: `risk_${level}`
      });
    }

    return {
      level: maxRisk(Object.values(action_risks)),
      action_risks,
      decisions
    };
  }
}

export function classifyAction(action: string): RiskLevel {
  const normalized = action.toLowerCase();
  if (
    isForbiddenAction(normalized) ||
    normalized.includes("seed_phrase") ||
    normalized.includes("private_key") ||
    normalized.includes("unrestricted_shell") ||
    normalized.includes("bypass_")
  ) {
    return "critical";
  }
  if (highRiskActions.has(normalized)) {
    return "high";
  }
  if (mediumRiskActions.has(normalized)) {
    return "medium";
  }
  return "low";
}
