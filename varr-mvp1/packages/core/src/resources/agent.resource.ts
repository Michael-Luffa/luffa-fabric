import {
  isRecord,
  optionalRecord,
  optionalStringArray,
  requireLiteral,
  requireOneOf,
  requiredString,
  validationIssues,
  validationOk,
  type ValidationResult
} from "../schemas/index.ts";
import { findSecretMaterial } from "../security/sanitizer.ts";

export const AGENT_STATUSES = ["active", "suspended", "revoked"] as const;
export const RUNTIME_ADAPTERS = ["mock", "openclaw_stub", "luffa_stub", "custom_api"] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type RuntimeAdapterName = (typeof RUNTIME_ADAPTERS)[number];

export type AgentResource = {
  kind: "AgentResource";
  version: "1.0";
  agent_id: string;
  owner_did: string;
  name: string;
  description: string;
  runtime_adapter: RuntimeAdapterName;
  behavior_profile: Record<string, unknown>;
  capability_bindings: string[];
  context_bindings: string[];
  status: AgentStatus;
  created_at: string;
  updated_at: string;
};

export function validateAgentResource(input: unknown): ValidationResult<AgentResource> {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return validationIssues(["AgentResource must be an object"]);
  }

  issues.push(...findSecretMaterial(input));
  requireLiteral(input, "kind", "AgentResource", issues);
  requireLiteral(input, "version", "1.0", issues);

  const agent_id = requiredString(input, "agent_id", issues);
  const owner_did = requiredString(input, "owner_did", issues);
  const name = requiredString(input, "name", issues);
  const description = requiredString(input, "description", issues);
  const runtime_adapter = requireOneOf(input, "runtime_adapter", RUNTIME_ADAPTERS, issues) as RuntimeAdapterName;
  const status = requireOneOf(input, "status", AGENT_STATUSES, issues) as AgentStatus;
  const created_at = requiredString(input, "created_at", issues);
  const updated_at = requiredString(input, "updated_at", issues);
  const behavior_profile = optionalRecord(input, "behavior_profile", issues);
  const capability_bindings = optionalStringArray(input, "capability_bindings", issues);
  const context_bindings = optionalStringArray(input, "context_bindings", issues);

  if (!agent_id.startsWith("did:luffa:agent:")) {
    issues.push("agent_id must be a Luffa agent DID");
  }
  if (!owner_did.startsWith("did:luffa:")) {
    issues.push("owner_did must be a Luffa DID");
  }

  if (issues.length > 0) {
    return validationIssues(issues);
  }

  return validationOk({
    kind: "AgentResource",
    version: "1.0",
    agent_id,
    owner_did,
    name,
    description,
    runtime_adapter,
    behavior_profile,
    capability_bindings,
    context_bindings,
    status,
    created_at,
    updated_at
  });
}

export type AgentPatch = Partial<Pick<AgentResource, "name" | "description" | "behavior_profile" | "capability_bindings" | "context_bindings" | "status">>;

export function validateAgentPatch(input: unknown): ValidationResult<AgentPatch> {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return validationIssues(["Agent patch must be an object"]);
  }
  issues.push(...findSecretMaterial(input));
  if (input.status !== undefined && !AGENT_STATUSES.includes(input.status as AgentStatus)) {
    issues.push(`status must be one of: ${AGENT_STATUSES.join(", ")}`);
  }
  if (input.name !== undefined && typeof input.name !== "string") {
    issues.push("name must be a string");
  }
  if (input.description !== undefined && typeof input.description !== "string") {
    issues.push("description must be a string");
  }
  if (input.behavior_profile !== undefined && !isRecord(input.behavior_profile)) {
    issues.push("behavior_profile must be an object");
  }
  if (input.capability_bindings !== undefined && (!Array.isArray(input.capability_bindings) || input.capability_bindings.some((item) => typeof item !== "string"))) {
    issues.push("capability_bindings must be an array of strings");
  }
  if (input.context_bindings !== undefined && (!Array.isArray(input.context_bindings) || input.context_bindings.some((item) => typeof item !== "string"))) {
    issues.push("context_bindings must be an array of strings");
  }
  if (issues.length > 0) {
    return validationIssues(issues);
  }
  return validationOk(input as AgentPatch);
}
