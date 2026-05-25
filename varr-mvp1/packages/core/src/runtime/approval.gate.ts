import type { CapabilityGrant } from "../resources/capability.resource.ts";
import type { RiskClassification } from "./risk.classifier.ts";

export type ApprovalGateResult =
  | { decision: "allow"; approval_required: false; reason: "not_required" }
  | { decision: "pending_approval"; approval_required: true; reason: string };

export class ApprovalGate {
  evaluate(actions: string[], risk: RiskClassification, capabilities: CapabilityGrant[]): ApprovalGateResult {
    if (risk.level === "high") {
      return { decision: "pending_approval", approval_required: true, reason: "high_risk_action" };
    }

    const approvalRequiredFor = new Set(capabilities.flatMap((capability) => capability.constraints.requires_approval_for));
    const action = actions.find((candidate) => approvalRequiredFor.has(candidate));
    if (action) {
      return { decision: "pending_approval", approval_required: true, reason: `capability_requires_approval:${action}` };
    }

    return { decision: "allow", approval_required: false, reason: "not_required" };
  }
}
