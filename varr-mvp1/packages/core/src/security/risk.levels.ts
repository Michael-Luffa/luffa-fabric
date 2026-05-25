export type RiskLevel = "low" | "medium" | "high" | "critical";

export type PolicyDecision = {
  action: string;
  decision: "allow" | "deny" | "pending_approval";
  reason: string;
};

const riskRank: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export function maxRisk(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>((highest, level) => (riskRank[level] > riskRank[highest] ? level : highest), "low");
}
