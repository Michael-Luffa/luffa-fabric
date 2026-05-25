import {
  isRecord,
  optionalBoolean,
  optionalNumber,
  optionalStringArray,
  requireLiteral,
  requireOneOf,
  requiredRecord,
  requiredString,
  requiredStringArray,
  validationIssues,
  validationOk,
  type ValidationResult
} from "../schemas/index.ts";
import { isForbiddenAction } from "../security/forbidden.actions.ts";
import { findSecretMaterial } from "../security/sanitizer.ts";

export const CAPABILITY_STATUSES = ["active", "expired", "revoked"] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export type CapabilityConstraints = {
  expires_at?: string;
  max_calls_per_day?: number;
  max_spend_usd: number;
  no_private_messages: boolean;
  requires_approval_for: string[];
};

export type CapabilityDelegation = {
  can_delegate: boolean;
  max_delegation_depth: number;
  allowed_delegatees: string[];
};

export type CapabilityRevocation = {
  revocable: boolean;
  cascade_revoke: boolean;
};

export type CapabilityGrant = {
  kind: "CapabilityGrant";
  version: "1.0";
  capability_id: string;
  issuer: string;
  subject: string;
  resource: string;
  actions: string[];
  constraints: CapabilityConstraints;
  delegation: CapabilityDelegation;
  revocation: CapabilityRevocation;
  status: CapabilityStatus;
  created_at: string;
};

export function validateCapabilityGrant(input: unknown): ValidationResult<CapabilityGrant> {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return validationIssues(["CapabilityGrant must be an object"]);
  }

  issues.push(...findSecretMaterial(input));
  requireLiteral(input, "kind", "CapabilityGrant", issues);
  requireLiteral(input, "version", "1.0", issues);

  const capability_id = requiredString(input, "capability_id", issues);
  const issuer = requiredString(input, "issuer", issues);
  const subject = requiredString(input, "subject", issues);
  const resource = requiredString(input, "resource", issues);
  const actions = requiredStringArray(input, "actions", issues);
  const constraintsInput = requiredRecord(input, "constraints", issues);
  const delegationInput = isRecord(input.delegation) ? input.delegation : {};
  const revocationInput = isRecord(input.revocation) ? input.revocation : {};
  const status = requireOneOf(input, "status", CAPABILITY_STATUSES, issues) as CapabilityStatus;
  const created_at = requiredString(input, "created_at", issues);

  for (const action of actions) {
    if (isForbiddenAction(action)) {
      issues.push(`actions cannot include forbidden action: ${action}`);
    }
  }

  if (!subject.startsWith("did:luffa:agent:")) {
    issues.push("subject must reference a Luffa agent DID");
  }
  if (!issuer.startsWith("did:luffa:")) {
    issues.push("issuer must be a Luffa DID");
  }

  const max_spend_usd = optionalNumber(constraintsInput, "max_spend_usd", 0, issues);
  const no_private_messages = optionalBoolean(constraintsInput, "no_private_messages", true, issues);
  const requires_approval_for = optionalStringArray(constraintsInput, "requires_approval_for", issues);
  const expires_at = typeof constraintsInput.expires_at === "string" ? constraintsInput.expires_at : undefined;
  const max_calls_per_day = typeof constraintsInput.max_calls_per_day === "number" ? constraintsInput.max_calls_per_day : undefined;

  if (max_spend_usd !== 0) {
    issues.push("MVP1 requires max_spend_usd=0");
  }
  if (no_private_messages !== true) {
    issues.push("MVP1 requires no_private_messages=true");
  }

  const delegation: CapabilityDelegation = {
    can_delegate: optionalBoolean(delegationInput, "can_delegate", false, issues),
    max_delegation_depth: optionalNumber(delegationInput, "max_delegation_depth", 0, issues),
    allowed_delegatees: optionalStringArray(delegationInput, "allowed_delegatees", issues)
  };
  if (delegation.can_delegate !== false) {
    issues.push("MVP1 requires delegation.can_delegate=false");
  }
  if (delegation.max_delegation_depth !== 0) {
    issues.push("MVP1 requires delegation.max_delegation_depth=0");
  }

  const revocation: CapabilityRevocation = {
    revocable: optionalBoolean(revocationInput, "revocable", true, issues),
    cascade_revoke: optionalBoolean(revocationInput, "cascade_revoke", true, issues)
  };

  if (issues.length > 0) {
    return validationIssues(issues);
  }

  return validationOk({
    kind: "CapabilityGrant",
    version: "1.0",
    capability_id,
    issuer,
    subject,
    resource,
    actions,
    constraints: {
      expires_at,
      max_calls_per_day,
      max_spend_usd,
      no_private_messages,
      requires_approval_for
    },
    delegation,
    revocation,
    status,
    created_at
  });
}
