import {
  isRecord,
  optionalBoolean,
  requireLiteral,
  requireOneOf,
  requiredString,
  requiredStringArray,
  validationIssues,
  validationOk,
  type ValidationResult
} from "../schemas/index.ts";
import { findSecretMaterial } from "../security/sanitizer.ts";

export const CONTEXT_SCOPES = ["community_public", "community_private", "user_private", "enterprise_private"] as const;
export const CONTEXT_STATUSES = ["active", "suspended", "revoked"] as const;
export const MEMORY_TYPES = ["short_term", "long_term", "episodic", "semantic"] as const;

export type ContextScope = (typeof CONTEXT_SCOPES)[number];
export type ContextStatus = (typeof CONTEXT_STATUSES)[number];
export type MemoryType = (typeof MEMORY_TYPES)[number];

export type ContextDataSource = {
  type: string;
  ref: string;
};

export type ContextResource = {
  kind: "ContextResource";
  version: "1.0";
  context_id: string;
  namespace: string;
  owner: string;
  scope: ContextScope;
  allowed_subjects: string[];
  retrieval_policy: string;
  memory_type: MemoryType;
  consent_required: boolean;
  cross_namespace_access: boolean;
  data_sources: ContextDataSource[];
  status: ContextStatus;
};

export function validateContextResource(input: unknown): ValidationResult<ContextResource> {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return validationIssues(["ContextResource must be an object"]);
  }

  issues.push(...findSecretMaterial(input));
  requireLiteral(input, "kind", "ContextResource", issues);
  requireLiteral(input, "version", "1.0", issues);

  const context_id = requiredString(input, "context_id", issues);
  const namespace = requiredString(input, "namespace", issues);
  const owner = requiredString(input, "owner", issues);
  const scope = requireOneOf(input, "scope", CONTEXT_SCOPES, issues) as ContextScope;
  const allowed_subjects = requiredStringArray(input, "allowed_subjects", issues);
  const retrieval_policy = requiredString(input, "retrieval_policy", issues);
  const memory_type = requireOneOf(input, "memory_type", MEMORY_TYPES, issues) as MemoryType;
  const consent_required = optionalBoolean(input, "consent_required", false, issues);
  const cross_namespace_access = optionalBoolean(input, "cross_namespace_access", false, issues);
  const status = requireOneOf(input, "status", CONTEXT_STATUSES, issues) as ContextStatus;

  const data_sources: ContextDataSource[] = [];
  if (!Array.isArray(input.data_sources)) {
    issues.push("data_sources must be an array");
  } else {
    for (const [index, item] of input.data_sources.entries()) {
      if (!isRecord(item) || typeof item.type !== "string" || typeof item.ref !== "string") {
        issues.push(`data_sources[${index}] must include type and ref strings`);
      } else {
        data_sources.push({ type: item.type, ref: item.ref });
      }
    }
  }

  if (!namespace.includes(":")) {
    issues.push("namespace must use a scoped form such as community:123");
  }
  if (!owner.startsWith("did:luffa:")) {
    issues.push("owner must be a Luffa DID");
  }
  if (allowed_subjects.some((subject) => !subject.startsWith("did:luffa:agent:"))) {
    issues.push("allowed_subjects must contain Luffa agent DIDs");
  }

  if (issues.length > 0) {
    return validationIssues(issues);
  }

  return validationOk({
    kind: "ContextResource",
    version: "1.0",
    context_id,
    namespace,
    owner,
    scope,
    allowed_subjects,
    retrieval_policy,
    memory_type,
    consent_required,
    cross_namespace_access,
    data_sources,
    status
  });
}
