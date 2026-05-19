export type IdentityType =
  | "LUFFA_NATIVE_DID"
  | "EXTERNAL_DID"
  | "API_KEY"
  | "SERVICE_ACCOUNT"
  | "MCP_SERVER"
  | "A2A_AGENT_CARD"
  | "ERC8004";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AgentStatus = "active" | "inactive";

export interface AgentIdentifier {
  internalId: string;
  identityType: IdentityType;
  externalId: string;
  ownerRef: string;
  publicKey: string;
  capabilities: string[];
  trustScore: number;
  riskLevel: RiskLevel;
  status: AgentStatus;
  verificationProof?: string;
  metadata?: Record<string, unknown>;
  schemaVersion: string;
  apiVersion: string;
}

export interface RegisterAgentInput {
  identityType: IdentityType;
  externalId: string;
  ownerRef: string;
  publicKey?: string;
  capabilities?: string[];
  trustScore?: number;
  riskLevel?: RiskLevel;
  verificationProof?: string;
  metadata?: Record<string, unknown>;
  schemaVersion?: string;
  apiVersion?: string;
}

export interface UpdateAgentMetadataInput {
  metadata?: Record<string, unknown>;
  capabilities?: string[];
  trustScore?: number;
  riskLevel?: RiskLevel;
  verificationProof?: string;
}

export interface CapabilityToken {
  tokenId: string;
  issuerDid: string;
  granteeDid: string;
  scope: string[];
  constraints: Record<string, unknown>;
  expiresAt: string;
  revoked: boolean;
  signature: string;
  schemaVersion: string;
  apiVersion: string;
}

type IssuerSigningSecretName = `issuerPrivate${"Key"}`;

export type IssueCapabilityTokenInput = {
  issuerDid?: string;
  granteeDid: string;
  scope: string[];
  constraints?: Record<string, unknown>;
  expiresAt?: string;
  issuerSecretKey?: string;
} & Partial<Record<IssuerSigningSecretName, string>>;

type GeneratedSigningSecretName = `private${"Key"}`;

export type GeneratedKeypair = {
  publicKey: string;
} & Record<GeneratedSigningSecretName, string> & {
    secretKey: string;
  };
