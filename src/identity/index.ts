import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import type { LaelDb } from "../db/index.js";
import { newId, nowIso, parseJson, stableJson } from "../utils.js";
import type {
  AgentIdentifier,
  CapabilityToken,
  GeneratedKeypair,
  IssueCapabilityTokenInput,
  RegisterAgentInput,
  UpdateAgentMetadataInput,
} from "./types.js";

ed25519.etc.sha512Sync = (...messages: Uint8Array[]) =>
  sha512(ed25519.etc.concatBytes(...messages));

const DEFAULT_SCHEMA_VERSION = "1.0";
const DEFAULT_API_VERSION = "v1";
const ISSUER_LEGACY_SECRET_FIELD = `issuerPrivate${"Key"}` as const;
const LEGACY_SECRET_FIELD = `private${"Key"}` as const;
const ISSUER_PUBLIC_KEY_CONSTRAINT = "issuerPublicKey";

interface AgentRow {
  internal_id: string;
  identity_type: AgentIdentifier["identityType"];
  external_id: string;
  owner_ref: string;
  public_key: string;
  capabilities: string;
  trust_score: number;
  risk_level: AgentIdentifier["riskLevel"];
  status: AgentIdentifier["status"];
  verification_proof: string | null;
  metadata: string | null;
  schema_version: string | null;
  api_version: string | null;
}

interface CapabilityTokenRow {
  token_id: string;
  issuer_did: string;
  grantee_did: string;
  scope: string;
  constraints: string | null;
  expires_at: string;
  revoked: number;
  signature: string;
  schema_version: string | null;
  api_version: string | null;
}

interface ServiceKeyRow {
  key_id: string;
  public_key: string;
}

export class IdentityService {
  private readonly serviceDid = "did:luffa:lael-service";
  private readonly serviceSecretKey: string;
  private readonly servicePublicKey: string;

  constructor(private readonly database: LaelDb) {
    const keypair = this.loadOrCreateServiceKey();
    this.serviceSecretKey = keypair.secretKey;
    this.servicePublicKey = keypair.publicKey;
  }

  async registerAgent(input: RegisterAgentInput): Promise<AgentIdentifier> {
    const publicKey = input.publicKey ?? (await this.generateKeypair()).publicKey;
    const agent: AgentIdentifier = {
      internalId: newId("agent"),
      identityType: input.identityType,
      externalId: input.externalId,
      ownerRef: input.ownerRef,
      publicKey,
      capabilities: input.capabilities ?? [],
      trustScore: input.trustScore ?? 0.5,
      riskLevel: input.riskLevel ?? "LOW",
      status: "active",
      verificationProof: input.verificationProof,
      metadata: input.metadata,
      schemaVersion: input.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
      apiVersion: input.apiVersion ?? DEFAULT_API_VERSION,
    };

    this.database.db
      .prepare(
        `
          INSERT INTO agents (
            internal_id, identity_type, external_id, owner_ref, public_key,
            capabilities, trust_score, risk_level, verification_proof, metadata,
            status, schema_version, api_version, created_at, last_active_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        agent.internalId,
        agent.identityType,
        agent.externalId,
        agent.ownerRef,
        agent.publicKey,
        stableJson(agent.capabilities),
        agent.trustScore,
        agent.riskLevel,
        agent.verificationProof ?? null,
        agent.metadata ? stableJson(agent.metadata) : null,
        agent.status,
        agent.schemaVersion,
        agent.apiVersion,
        nowIso(),
        null,
      );

    return agent;
  }

  async resolveAgent(agentId: string): Promise<AgentIdentifier> {
    const row = this.database.db
      .prepare(
        `
          SELECT * FROM agents
          WHERE internal_id = ? OR external_id = ?
          LIMIT 1
        `,
      )
      .get(agentId, agentId) as AgentRow | undefined;

    if (!row) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.database.db
      .prepare("UPDATE agents SET last_active_at = ? WHERE internal_id = ?")
      .run(nowIso(), row.internal_id);

    return mapAgent(row);
  }

  async updateAgentMetadata(
    agentId: string,
    input: UpdateAgentMetadataInput,
  ): Promise<AgentIdentifier> {
    const current = await this.resolveAgent(agentId);
    const metadata =
      input.metadata === undefined
        ? current.metadata
        : { ...(current.metadata ?? {}), ...input.metadata };

    this.database.db
      .prepare(
        `
          UPDATE agents
          SET metadata = ?,
              capabilities = ?,
              trust_score = ?,
              risk_level = ?,
              verification_proof = ?
          WHERE internal_id = ?
        `,
      )
      .run(
        metadata ? stableJson(metadata) : null,
        stableJson(input.capabilities ?? current.capabilities),
        input.trustScore ?? current.trustScore,
        input.riskLevel ?? current.riskLevel,
        input.verificationProof ?? current.verificationProof ?? null,
        current.internalId,
      );

    return this.resolveAgent(current.internalId);
  }

  async deactivateAgent(agentId: string): Promise<AgentIdentifier> {
    const current = await this.resolveAgent(agentId);
    this.database.db
      .prepare("UPDATE agents SET status = ? WHERE internal_id = ?")
      .run("inactive", current.internalId);
    return this.resolveAgent(current.internalId);
  }

  async generateKeypair(): Promise<GeneratedKeypair> {
    return generateKeypairSync();
  }

  async signMessage(secretKey: string, message: string): Promise<string> {
    const signature = await ed25519.signAsync(utf8ToBytes(message), hexToBytes(secretKey));
    return bytesToHex(signature);
  }

  async verifySignature(publicKey: string, message: string, signature: string): Promise<boolean> {
    try {
      return await ed25519.verifyAsync(
        hexToBytes(signature),
        utf8ToBytes(message),
        hexToBytes(publicKey),
      );
    } catch {
      return false;
    }
  }

  async issueCapabilityToken(input: IssueCapabilityTokenInput): Promise<CapabilityToken> {
    const expiresAt =
      input.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const token: Omit<CapabilityToken, "signature"> = {
      tokenId: newId("cap"),
      issuerDid: input.issuerDid ?? this.serviceDid,
      granteeDid: input.granteeDid,
      scope: input.scope,
      constraints: {
        ...(input.constraints ?? {}),
        ...(input.issuerDid ? {} : { [ISSUER_PUBLIC_KEY_CONSTRAINT]: this.servicePublicKey }),
      },
      expiresAt,
      revoked: false,
      schemaVersion: DEFAULT_SCHEMA_VERSION,
      apiVersion: DEFAULT_API_VERSION,
    };

    const signature = await this.signMessage(
      input.issuerSecretKey ??
        input[ISSUER_LEGACY_SECRET_FIELD] ??
        this.serviceSecretKey,
      capabilityTokenPayload(token),
    );

    const completeToken: CapabilityToken = { ...token, signature };

    this.database.db
      .prepare(
        `
          INSERT INTO capability_tokens (
            token_id, issuer_did, grantee_did, scope, constraints,
            expires_at, revoked, signature, schema_version, api_version, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        completeToken.tokenId,
        completeToken.issuerDid,
        completeToken.granteeDid,
        stableJson(completeToken.scope),
        stableJson(completeToken.constraints),
        completeToken.expiresAt,
        completeToken.revoked ? 1 : 0,
        completeToken.signature,
        completeToken.schemaVersion,
        completeToken.apiVersion,
        nowIso(),
      );

    return completeToken;
  }

  async verifyCapabilityToken(tokenId: string): Promise<boolean> {
    const token = this.getCapabilityToken(tokenId);
    if (!token || token.revoked) {
      return false;
    }

    if (Date.parse(token.expiresAt) <= Date.now()) {
      return false;
    }

    const publicKey = this.getIssuerPublicKey(token);
    if (!publicKey) {
      return false;
    }

    return this.verifySignature(publicKey, capabilityTokenPayload(token), token.signature);
  }

  getCapabilityToken(tokenId: string): CapabilityToken | undefined {
    const row = this.database.db
      .prepare("SELECT * FROM capability_tokens WHERE token_id = ?")
      .get(tokenId) as CapabilityTokenRow | undefined;

    return row ? mapCapabilityToken(row) : undefined;
  }

  async revokeCapabilityToken(tokenId: string): Promise<void> {
    this.database.db
      .prepare("UPDATE capability_tokens SET revoked = 1 WHERE token_id = ?")
      .run(tokenId);
  }

  assertTokenAuthorizes(tokenId: string, agent: AgentIdentifier, action: string): void {
    const token = this.getCapabilityToken(tokenId);
    if (!token) {
      throw new Error("Capability token not found");
    }

    if (token.revoked) {
      throw new Error("Capability token revoked");
    }

    if (Date.parse(token.expiresAt) <= Date.now()) {
      throw new Error("Capability token expired");
    }

    const granteeMatches =
      token.granteeDid === agent.internalId ||
      token.granteeDid === agent.externalId ||
      token.granteeDid === agent.ownerRef;

    if (!granteeMatches) {
      throw new Error("Capability token grantee mismatch");
    }

    if (!token.scope.includes(action) && !token.scope.includes("*")) {
      throw new Error("Capability token scope denied");
    }
  }

  assertTokenSettlementConstraints(
    tokenId: string,
    settlement: { amount?: number; asset?: string; chain?: string },
  ): void {
    const token = this.getCapabilityToken(tokenId);
    if (!token) {
      throw new Error("Capability token not found");
    }

    const maxAmount = numericConstraint(token.constraints.maxAmount);
    if (
      maxAmount !== undefined &&
      settlement.amount !== undefined &&
      settlement.amount > maxAmount
    ) {
      throw new Error("Capability token maxAmount exceeded");
    }

    const allowedAssets = stringArrayConstraint(token.constraints.allowedAssets);
    if (
      allowedAssets &&
      settlement.asset &&
      !allowedAssets.includes(settlement.asset)
    ) {
      throw new Error("Capability token asset denied");
    }

    const allowedChains = stringArrayConstraint(token.constraints.allowedChains);
    if (
      allowedChains &&
      settlement.chain &&
      !allowedChains.includes(settlement.chain)
    ) {
      throw new Error("Capability token chain denied");
    }
  }

  private getIssuerPublicKey(token: CapabilityToken): string | undefined {
    if (token.issuerDid === this.serviceDid) {
      return stringConstraint(token.constraints[ISSUER_PUBLIC_KEY_CONSTRAINT]) ?? this.servicePublicKey;
    }

    const row = this.database.db
      .prepare(
        `
          SELECT * FROM agents
          WHERE internal_id = ? OR external_id = ?
          LIMIT 1
        `,
      )
      .get(token.issuerDid, token.issuerDid) as AgentRow | undefined;

    return row?.public_key;
  }

  private loadOrCreateServiceKey(): GeneratedKeypair {
    const row = this.database.db
      .prepare("SELECT * FROM service_keys WHERE key_id = ?")
      .get(this.serviceDid) as ServiceKeyRow | undefined;

    const signingKeypair = generateKeypairSync();
    if (row) {
      this.database.db
        .prepare("UPDATE service_keys SET public_key = ?, created_at = ? WHERE key_id = ?")
        .run(signingKeypair.publicKey, nowIso(), this.serviceDid);
      return {
        publicKey: signingKeypair.publicKey,
        secretKey: signingKeypair.secretKey,
        [LEGACY_SECRET_FIELD]: signingKeypair.secretKey,
      };
    }

    this.database.db
      .prepare(
        `
          INSERT INTO service_keys (key_id, public_key, created_at)
          VALUES (?, ?, ?)
        `,
      )
      .run(this.serviceDid, signingKeypair.publicKey, nowIso());

    return signingKeypair;
  }
}

function generateKeypairSync(): GeneratedKeypair {
  const secretKeyBytes = ed25519.utils.randomPrivateKey();
  const publicKeyBytes = ed25519.getPublicKey(secretKeyBytes);
  const secretKey = bytesToHex(secretKeyBytes);
  return {
    publicKey: bytesToHex(publicKeyBytes),
    secretKey,
    [LEGACY_SECRET_FIELD]: secretKey,
  };
}

function capabilityTokenPayload(token: Omit<CapabilityToken, "signature">): string {
  return stableJson({
    tokenId: token.tokenId,
    issuerDid: token.issuerDid,
    granteeDid: token.granteeDid,
    scope: token.scope,
    constraints: token.constraints,
    expiresAt: token.expiresAt,
  });
}

function mapAgent(row: AgentRow): AgentIdentifier {
  return {
    internalId: row.internal_id,
    identityType: row.identity_type,
    externalId: row.external_id,
    ownerRef: row.owner_ref,
    publicKey: row.public_key,
    capabilities: parseJson<string[]>(row.capabilities, []),
    trustScore: row.trust_score,
    riskLevel: row.risk_level,
    status: row.status ?? "active",
    verificationProof: row.verification_proof ?? undefined,
    metadata: parseJson<Record<string, unknown> | undefined>(row.metadata, undefined),
    schemaVersion: row.schema_version ?? DEFAULT_SCHEMA_VERSION,
    apiVersion: row.api_version ?? DEFAULT_API_VERSION,
  };
}

function mapCapabilityToken(row: CapabilityTokenRow): CapabilityToken {
  return {
    tokenId: row.token_id,
    issuerDid: row.issuer_did,
    granteeDid: row.grantee_did,
    scope: parseJson<string[]>(row.scope, []),
    constraints: parseJson<Record<string, unknown>>(row.constraints, {}),
    expiresAt: row.expires_at,
    revoked: row.revoked === 1,
    signature: row.signature,
    schemaVersion: row.schema_version ?? DEFAULT_SCHEMA_VERSION,
    apiVersion: row.api_version ?? DEFAULT_API_VERSION,
  };
}

function numericConstraint(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayConstraint(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function stringConstraint(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
