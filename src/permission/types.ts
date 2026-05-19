export interface PermissionPolicy {
  policyId: string;
  ownerRef: string;
  version: string;
  priority: number;
  jsonRules: {
    allowedActions: string[];
    deniedActions?: string[];
    maxBudgetPerAction?: number;
    maxTotalBudget?: number;
    allowedAssets?: string[];
    allowedChains?: string[];
    requiresConfirmation?: boolean;
    riskThreshold?: number;
    contextConstraints?: Record<string, unknown>[];
  };
  cryptoCommitment?: string;
  zkPolicyProof?: string;
  active: boolean;
  schemaVersion: string;
  apiVersion: string;
}

export interface CreatePolicyInput {
  policyId?: string;
  ownerRef: string;
  version?: string;
  priority?: number;
  jsonRules: PermissionPolicy["jsonRules"];
  cryptoCommitment?: string;
  zkPolicyProof?: string;
  active?: boolean;
  schemaVersion?: string;
  apiVersion?: string;
}

export type PermissionDecisionValue = "ALLOW" | "DENY" | "REQUIRES_CONFIRMATION";

export interface PermissionDecision {
  decisionId: string;
  agentId: string;
  action: string;
  decision: PermissionDecisionValue;
  matchedPolicyId?: string;
  riskScore: number;
  budget: number;
  requiresConfirmation: boolean;
  context?: Record<string, unknown>;
  reason?: string;
  createdAt: string;
  schemaVersion: string;
  apiVersion: string;
}

export interface PermissionEvaluationRequest {
  agentId: string;
  ownerRef: string;
  action: string;
  params?: Record<string, unknown>;
  context?: Record<string, unknown>;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}
