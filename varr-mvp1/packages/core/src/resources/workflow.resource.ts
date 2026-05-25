import {
  isRecord,
  optionalStringArray,
  requireLiteral,
  requireOneOf,
  requiredString,
  requiredStringArray,
  validationIssues,
  validationOk,
  type ValidationResult
} from "../schemas/index.ts";
import { isForbiddenAction } from "../security/forbidden.actions.ts";
import { findSecretMaterial } from "../security/sanitizer.ts";
import type { RiskLevel } from "../security/risk.levels.ts";

export const WORKFLOW_STATUSES = ["active", "suspended", "revoked"] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export type WorkflowStep = {
  id: string;
  action: string;
  resource?: string;
  skill?: string;
};

export type WorkflowResource = {
  kind: "WorkflowResource";
  version: "1.0";
  workflow_id: string;
  name: string;
  owner: string;
  allowed_agents: string[];
  steps: WorkflowStep[];
  risk_profile: RiskLevel;
  status: WorkflowStatus;
};

export function validateWorkflowResource(input: unknown): ValidationResult<WorkflowResource> {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return validationIssues(["WorkflowResource must be an object"]);
  }

  issues.push(...findSecretMaterial(input));
  requireLiteral(input, "kind", "WorkflowResource", issues);
  requireLiteral(input, "version", "1.0", issues);

  const workflow_id = requiredString(input, "workflow_id", issues);
  const name = requiredString(input, "name", issues);
  const owner = requiredString(input, "owner", issues);
  const allowed_agents = requiredStringArray(input, "allowed_agents", issues);
  const risk_profile = requireOneOf(input, "risk_profile", ["low", "medium", "high", "critical"], issues) as RiskLevel;
  const status = requireOneOf(input, "status", WORKFLOW_STATUSES, issues) as WorkflowStatus;

  const steps: WorkflowStep[] = [];
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    issues.push("steps must be a non-empty array");
  } else {
    const seenIds = new Set<string>();
    for (const [index, item] of input.steps.entries()) {
      if (!isRecord(item)) {
        issues.push(`steps[${index}] must be an object`);
        continue;
      }
      const id = typeof item.id === "string" ? item.id : "";
      const action = typeof item.action === "string" ? item.action : "";
      if (!id) {
        issues.push(`steps[${index}].id is required`);
      }
      if (seenIds.has(id)) {
        issues.push(`steps[${index}].id must be stable and unique`);
      }
      seenIds.add(id);
      if (!action) {
        issues.push(`steps[${index}].action is required`);
      }
      if (isForbiddenAction(action)) {
        issues.push(`workflow action is forbidden: ${action}`);
      }
      steps.push({
        id,
        action,
        resource: typeof item.resource === "string" ? item.resource : undefined,
        skill: typeof item.skill === "string" ? item.skill : undefined
      });
    }
  }

  if (!owner.startsWith("did:luffa:")) {
    issues.push("owner must be a Luffa DID");
  }
  if (allowed_agents.some((agent) => !agent.startsWith("did:luffa:agent:"))) {
    issues.push("allowed_agents must contain Luffa agent DIDs");
  }

  if (issues.length > 0) {
    return validationIssues(issues);
  }

  return validationOk({
    kind: "WorkflowResource",
    version: "1.0",
    workflow_id,
    name,
    owner,
    allowed_agents,
    steps,
    risk_profile,
    status
  });
}

export function workflowActions(workflow: WorkflowResource): string[] {
  return workflow.steps.map((step) => step.action);
}

export function workflowResources(workflow: WorkflowResource): string[] {
  return workflow.steps.flatMap((step) => (step.resource ? [step.resource] : []));
}
