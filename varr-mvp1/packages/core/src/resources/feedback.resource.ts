import {
  isRecord,
  optionalNumber,
  optionalString,
  requireLiteral,
  requireOneOf,
  requiredString,
  validationIssues,
  validationOk,
  type ValidationResult
} from "../schemas/index.ts";
import { findSecretMaterial } from "../security/sanitizer.ts";

export const FEEDBACK_SOURCES = ["user", "community", "reviewer", "system"] as const;
export const FEEDBACK_LABELS = ["accepted", "rejected", "corrected", "disputed", "unsafe", "low_quality"] as const;

export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];
export type FeedbackLabel = (typeof FEEDBACK_LABELS)[number];

export type FeedbackResource = {
  kind: "FeedbackResource";
  version: "1.0";
  feedback_id: string;
  receipt_id: string;
  source: FeedbackSource;
  source_did: string;
  label: FeedbackLabel;
  score: number;
  comment?: string;
  verified: boolean;
  weight: number;
  created_at: string;
};

export function validateFeedbackResource(input: unknown): ValidationResult<FeedbackResource> {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return validationIssues(["FeedbackResource must be an object"]);
  }

  issues.push(...findSecretMaterial(input));
  requireLiteral(input, "kind", "FeedbackResource", issues);
  requireLiteral(input, "version", "1.0", issues);

  const feedback_id = requiredString(input, "feedback_id", issues);
  const receipt_id = requiredString(input, "receipt_id", issues);
  const source = requireOneOf(input, "source", FEEDBACK_SOURCES, issues) as FeedbackSource;
  const source_did = requiredString(input, "source_did", issues);
  const label = requireOneOf(input, "label", FEEDBACK_LABELS, issues) as FeedbackLabel;
  const score = optionalNumber(input, "score", 0, issues);
  const comment = optionalString(input, "comment", issues);
  const verified = input.verified === true;
  const weight = optionalNumber(input, "weight", 1, issues);
  const created_at = requiredString(input, "created_at", issues);

  if (!source_did.startsWith("did:luffa:")) {
    issues.push("source_did must be a Luffa DID");
  }
  if (score < 0 || score > 5) {
    issues.push("score must be between 0 and 5");
  }
  if (weight < 0) {
    issues.push("weight must be non-negative");
  }

  if (issues.length > 0) {
    return validationIssues(issues);
  }

  return validationOk({
    kind: "FeedbackResource",
    version: "1.0",
    feedback_id,
    receipt_id,
    source,
    source_did,
    label,
    score,
    comment,
    verified,
    weight,
    created_at
  });
}
