export interface ExecutionRequest {
  executionId?: string;
  agentId: string;
  targetDid?: string;
  action: string;
  params: Record<string, unknown>;
  rawInput?: string;
  idempotencyKey: string;
  context?: Record<string, unknown>;
  requireExecutionProof?: boolean;
  proofType?: "zkml" | "tee_attestation" | "multi_verification";
  capabilityTokenId?: string;
  schemaVersion?: string;
  apiVersion?: string;
}

export type ExecutionStatus = "SUCCESS" | "FAILED" | "DENIED";

export interface ExecutionRecord {
  executionId: string;
  agentId: string;
  targetDid?: string;
  action: string;
  params: Record<string, unknown>;
  rawInput?: string;
  result: Record<string, unknown>;
  status: ExecutionStatus;
  permissionDecisionId: string;
  settlementId?: string;
  chainType?: string;
  chainId?: string;
  txHash?: string;
  walletAddress?: string;
  gasUsed?: string;
  blockNumber?: number;
  feedback?: Record<string, unknown>;
  merkleLeafHash: string;
  merkleRoot?: string;
  merkleIndex?: number;
  zkProof?: string;
  teeAttestation?: string;
  durationMs: number;
  createdAt: string;
  schemaVersion: string;
  apiVersion: string;
}

export type ExecutionHandler = (
  request: ExecutionRequest,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

export interface MerkleProof {
  executionId: string;
  leafHash: string;
  root: string;
  index: number;
  siblings: Array<{ position: "left" | "right"; hash: string }>;
}
