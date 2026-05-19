import type { LaelDb } from "../db/index.js";
import { newId, nowIso, parseJson, stableJson } from "../utils.js";
import type {
  CreatePolicyInput,
  PermissionDecision,
  PermissionEvaluationRequest,
  PermissionPolicy,
} from "./types.js";

const DEFAULT_SCHEMA_VERSION = "1.0";
const DEFAULT_API_VERSION = "v1";

interface PolicyRow {
  policy_id: string;
  owner_ref: string;
  version: string;
  priority: number;
  json_rules: string;
  crypto_commitment: string | null;
  zk_policy_proof: string | null;
  active: number;
  schema_version: string | null;
  api_version: string | null;
}

export class PermissionService {
  constructor(private readonly database: LaelDb) {}

  async createPolicy(input: CreatePolicyInput): Promise<PermissionPolicy> {
    const policy: PermissionPolicy = {
      policyId: input.policyId ?? newId("policy"),
      ownerRef: input.ownerRef,
      version: input.version ?? "v0",
      priority: input.priority ?? 0,
      jsonRules: input.jsonRules,
      cryptoCommitment: input.cryptoCommitment,
      zkPolicyProof: input.zkPolicyProof,
      active: input.active ?? true,
      schemaVersion: input.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
      apiVersion: input.apiVersion ?? DEFAULT_API_VERSION,
    };

    this.database.db
      .prepare(
        `
          INSERT INTO policies (
            policy_id, owner_ref, version, priority, json_rules,
            crypto_commitment, zk_policy_proof, active, schema_version,
            api_version, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        policy.policyId,
        policy.ownerRef,
        policy.version,
        policy.priority,
        stableJson(policy.jsonRules),
        policy.cryptoCommitment ?? null,
        policy.zkPolicyProof ?? null,
        policy.active ? 1 : 0,
        policy.schemaVersion,
        policy.apiVersion,
        nowIso(),
      );

    return policy;
  }

  async evaluatePermission(request: PermissionEvaluationRequest): Promise<PermissionDecision> {
    const policies = this.getActivePolicies(request.ownerRef);
    const budget = deriveBudget(request.params, request.context);
    const riskScore = deriveRiskScore(request.riskLevel, request.context);

    const explicitDeny = policies.find(
      (policy) =>
        policyAppliesToContext(policy, request.context) &&
        actionMatchesAny(request.action, policy.jsonRules.deniedActions ?? []),
    );

    if (explicitDeny) {
      return this.writeDecision({
        request,
        decision: "DENY",
        matchedPolicyId: explicitDeny.policyId,
        riskScore,
        budget,
        requiresConfirmation: false,
        reason: "Denied by policy",
      });
    }

    const allowPolicy = policies.find(
      (policy) =>
        policyAppliesToContext(policy, request.context) &&
        actionMatchesAny(request.action, policy.jsonRules.allowedActions),
    );

    if (!allowPolicy) {
      return this.writeDecision({
        request,
        decision: "DENY",
        riskScore,
        budget,
        requiresConfirmation: false,
        reason: "Default deny",
      });
    }

    const rules = allowPolicy.jsonRules;
    if (rules.maxBudgetPerAction !== undefined && budget > rules.maxBudgetPerAction) {
      return this.writeDecision({
        request,
        decision: "DENY",
        matchedPolicyId: allowPolicy.policyId,
        riskScore,
        budget,
        requiresConfirmation: false,
        reason: "Budget exceeds maxBudgetPerAction",
      });
    }

    if (rules.maxTotalBudget !== undefined) {
      const usedBudget = this.getUsedBudget(request.agentId);
      if (usedBudget + budget > rules.maxTotalBudget) {
        return this.writeDecision({
          request,
          decision: "DENY",
          matchedPolicyId: allowPolicy.policyId,
          riskScore,
          budget,
          requiresConfirmation: false,
          reason: "Budget exceeds maxTotalBudget",
        });
      }
    }

    const settlementScope = deriveSettlementScope(request.params, request.context);
    if (
      rules.allowedAssets &&
      settlementScope.asset &&
      !rules.allowedAssets.includes(settlementScope.asset)
    ) {
      return this.writeDecision({
        request,
        decision: "DENY",
        matchedPolicyId: allowPolicy.policyId,
        riskScore,
        budget,
        requiresConfirmation: false,
        reason: "Asset denied by policy",
      });
    }

    if (
      rules.allowedChains &&
      settlementScope.chain &&
      !rules.allowedChains.includes(settlementScope.chain)
    ) {
      return this.writeDecision({
        request,
        decision: "DENY",
        matchedPolicyId: allowPolicy.policyId,
        riskScore,
        budget,
        requiresConfirmation: false,
        reason: "Chain denied by policy",
      });
    }

    if (rules.riskThreshold !== undefined && riskScore > rules.riskThreshold) {
      return this.writeDecision({
        request,
        decision: "DENY",
        matchedPolicyId: allowPolicy.policyId,
        riskScore,
        budget,
        requiresConfirmation: false,
        reason: "Risk exceeds threshold",
      });
    }

    const requiresConfirmation =
      rules.requiresConfirmation === true ||
      isHighRiskAction(request.action) ||
      riskScore >= 0.75 ||
      request.context?.requiresConfirmation === true;

    return this.writeDecision({
      request,
      decision: requiresConfirmation ? "REQUIRES_CONFIRMATION" : "ALLOW",
      matchedPolicyId: allowPolicy.policyId,
      riskScore,
      budget,
      requiresConfirmation,
      reason: requiresConfirmation ? "Requires confirmation" : undefined,
    });
  }

  recordDeny(
    request: PermissionEvaluationRequest,
    reason: string,
  ): PermissionDecision {
    return this.writeDecision({
      request,
      decision: "DENY",
      riskScore: deriveRiskScore(request.riskLevel, request.context),
      budget: deriveBudget(request.params, request.context),
      requiresConfirmation: false,
      reason,
    });
  }

  private getActivePolicies(ownerRef: string): PermissionPolicy[] {
    const rows = this.database.db
      .prepare(
        `
          SELECT * FROM policies
          WHERE owner_ref = ? AND active = 1
          ORDER BY priority DESC, created_at ASC
        `,
      )
      .all(ownerRef) as unknown as PolicyRow[];

    return rows.map(mapPolicy);
  }

  private getUsedBudget(agentId: string): number {
    const row = this.database.db
      .prepare(
        `
          SELECT COALESCE(SUM(budget), 0) AS total
          FROM permission_audits
          WHERE agent_id = ? AND decision = 'ALLOW'
        `,
      )
      .get(agentId) as { total: number } | undefined;

    return row?.total ?? 0;
  }

  private writeDecision(input: {
    request: PermissionEvaluationRequest;
    decision: PermissionDecision["decision"];
    matchedPolicyId?: string;
    riskScore: number;
    budget: number;
    requiresConfirmation: boolean;
    reason?: string;
  }): PermissionDecision {
    const decision: PermissionDecision = {
      decisionId: newId("decision"),
      agentId: input.request.agentId,
      action: input.request.action,
      decision: input.decision,
      matchedPolicyId: input.matchedPolicyId,
      riskScore: input.riskScore,
      budget: input.budget,
      requiresConfirmation: input.requiresConfirmation,
      context: input.request.context,
      reason: input.reason,
      createdAt: nowIso(),
      schemaVersion: DEFAULT_SCHEMA_VERSION,
      apiVersion: DEFAULT_API_VERSION,
    };

    this.database.db
      .prepare(
        `
          INSERT INTO permission_audits (
            decision_id, agent_id, action, decision, matched_policy_id,
            risk_score, budget, requires_confirmation, context, schema_version,
            api_version, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        decision.decisionId,
        decision.agentId,
        decision.action,
        decision.decision,
        decision.matchedPolicyId ?? null,
        decision.riskScore,
        decision.budget,
        decision.requiresConfirmation ? 1 : 0,
        stableJson({ ...(decision.context ?? {}), reason: decision.reason }),
        decision.schemaVersion,
        decision.apiVersion,
        decision.createdAt,
      );

    return decision;
  }
}

function mapPolicy(row: PolicyRow): PermissionPolicy {
  return {
    policyId: row.policy_id,
    ownerRef: row.owner_ref,
    version: row.version,
    priority: row.priority,
    jsonRules: parseJson<PermissionPolicy["jsonRules"]>(row.json_rules, {
      allowedActions: [],
    }),
    cryptoCommitment: row.crypto_commitment ?? undefined,
    zkPolicyProof: row.zk_policy_proof ?? undefined,
    active: row.active === 1,
    schemaVersion: row.schema_version ?? DEFAULT_SCHEMA_VERSION,
    apiVersion: row.api_version ?? DEFAULT_API_VERSION,
  };
}

function deriveBudget(
  params: Record<string, unknown> | undefined,
  context: Record<string, unknown> | undefined,
): number {
  const candidates = [
    context?.budget,
    params?.budget,
    params?.amount,
    getNestedNumber(params, "settlement", "amount"),
    getNestedNumber(context, "settlement", "amount"),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return 0;
}

function deriveSettlementScope(
  params: Record<string, unknown> | undefined,
  context: Record<string, unknown> | undefined,
): { asset?: string; chain?: string } {
  const settlement = objectLike(params?.settlement) ?? objectLike(context?.settlement);
  const source = settlement ?? params ?? {};
  const asset = stringValue(source.asset) ?? stringValue(context?.asset);
  const chain =
    stringValue(source.chainKey) ??
    stringValue(source.chainId) ??
    stringValue(source.chainType) ??
    stringValue(context?.chainKey) ??
    stringValue(context?.chainId) ??
    stringValue(context?.chainType);

  return { asset, chain };
}

function getNestedNumber(
  source: Record<string, unknown> | undefined,
  objectKey: string,
  numberKey: string,
): number | undefined {
  const nested = source?.[objectKey];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return undefined;
  }

  const value = (nested as Record<string, unknown>)[numberKey];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectLike(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function deriveRiskScore(
  riskLevel: PermissionEvaluationRequest["riskLevel"],
  context: Record<string, unknown> | undefined,
): number {
  if (typeof context?.riskScore === "number" && Number.isFinite(context.riskScore)) {
    return context.riskScore;
  }

  switch (riskLevel) {
    case "MEDIUM":
      return 0.4;
    case "HIGH":
      return 0.75;
    case "CRITICAL":
      return 0.95;
    default:
      return 0.1;
  }
}

function actionMatchesAny(action: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === "*" || pattern === action) {
      return true;
    }
    if (pattern.endsWith("*")) {
      return action.startsWith(pattern.slice(0, -1));
    }
    return false;
  });
}

function policyAppliesToContext(
  policy: PermissionPolicy,
  context: Record<string, unknown> | undefined,
): boolean {
  const constraints = policy.jsonRules.contextConstraints;
  if (!constraints || constraints.length === 0) {
    return true;
  }

  return constraints.every((constraint) =>
    Object.entries(constraint).every(([key, expected]) => context?.[key] === expected),
  );
}

function isHighRiskAction(action: string): boolean {
  return action === "luffa.trigger_payment" || action === "luffa.reward_user";
}
