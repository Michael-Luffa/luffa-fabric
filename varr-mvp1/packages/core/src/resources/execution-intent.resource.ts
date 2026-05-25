import {
  isRecord,
  optionalRecord,
  requireLiteral,
  requiredString,
  requiredStringArray,
  validationIssues,
  validationOk,
  type ValidationResult
} from "../schemas/index.ts";
import { findSecretMaterial } from "../security/sanitizer.ts";

export type ExecutionIntent = {
  kind: "ExecutionIntent";
  intent_id: string;
  agent_id: string;
  workflow_id: string;
  requested_by: string;
  context_refs: string[];
  input: Record<string, unknown>;
  requested_actions: string[];
  created_at: string;
};

export function validateExecutionIntent(input: unknown): ValidationResult<ExecutionIntent> {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return validationIssues(["ExecutionIntent must be an object"]);
  }

  issues.push(...findSecretMaterial(input));
  requireLiteral(input, "kind", "ExecutionIntent", issues);

  const intent_id = requiredString(input, "intent_id", issues);
  const agent_id = requiredString(input, "agent_id", issues);
  const workflow_id = requiredString(input, "workflow_id", issues);
  const requested_by = requiredString(input, "requested_by", issues);
  const context_refs = requiredStringArray(input, "context_refs", issues);
  const requestInput = optionalRecord(input, "input", issues);
  const requested_actions = requiredStringArray(input, "requested_actions", issues);
  const created_at = requiredString(input, "created_at", issues);

  if (!agent_id.startsWith("did:luffa:agent:")) {
    issues.push("agent_id must be a Luffa agent DID");
  }
  if (!requested_by.startsWith("did:luffa:")) {
    issues.push("requested_by must be a Luffa DID");
  }

  if (issues.length > 0) {
    return validationIssues(issues);
  }

  return validationOk({
    kind: "ExecutionIntent",
    intent_id,
    agent_id,
    workflow_id,
    requested_by,
    context_refs,
    input: requestInput,
    requested_actions,
    created_at
  });
}
