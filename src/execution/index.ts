import type { LaelDb } from "../db/index.js";
import type { PermissionDecision } from "../permission/types.js";
import { newId, nowIso, parseJson, sha256Hex, stableJson } from "../utils.js";
import { builtInHandlers } from "./handlers.js";
import { buildMerkleProof, buildMerkleRoot, verifyMerkleProof as verifyProof } from "./merkle.js";
import type {
  ExecutionHandler,
  ExecutionRecord,
  ExecutionRequest,
  ExecutionStatus,
  MerkleProof,
} from "./types.js";

const DEFAULT_SCHEMA_VERSION = "1.0";
const DEFAULT_API_VERSION = "v1";

interface ExecutionRow {
  execution_id: string;
  agent_id: string;
  target_did: string | null;
  action: string;
  params: string;
  raw_input: string | null;
  result: string | null;
  status: ExecutionStatus;
  permission_decision_id: string;
  settlement_id: string | null;
  chain_type: string | null;
  chain_id: string | null;
  tx_hash: string | null;
  wallet_address: string | null;
  gas_used: string | null;
  block_number: number | null;
  feedback: string | null;
  merkle_leaf_hash: string;
  merkle_root: string | null;
  merkle_index: number | null;
  zk_proof: string | null;
  tee_attestation: string | null;
  duration_ms: number | null;
  created_at: string;
  schema_version: string | null;
  api_version: string | null;
}

interface PermissionAuditRow {
  decision_id: string;
  agent_id: string;
  action: string;
  decision: PermissionDecision["decision"];
}

interface ExecuteOptions {
  afterHandler?: (
    result: Record<string, unknown>,
  ) =>
    | Promise<{
        result: Record<string, unknown>;
        status?: Exclude<ExecutionStatus, "DENIED">;
        settlementId?: string;
        chainType?: string;
        chainId?: string;
        txHash?: string;
        walletAddress?: string;
        gasUsed?: string;
        blockNumber?: number;
      }>
    | {
        result: Record<string, unknown>;
        status?: Exclude<ExecutionStatus, "DENIED">;
        settlementId?: string;
        chainType?: string;
        chainId?: string;
        txHash?: string;
        walletAddress?: string;
        gasUsed?: string;
        blockNumber?: number;
      };
}

export class ExecutionService {
  private readonly handlers = new Map<string, ExecutionHandler>();

  constructor(private readonly database: LaelDb) {
    for (const [action, handler] of Object.entries(builtInHandlers)) {
      this.registerHandler(action, handler);
    }
  }

  registerHandler(actionPattern: string, handler: ExecutionHandler): void {
    this.handlers.set(actionPattern, handler);
  }

  async execute(
    request: ExecutionRequest,
    permissionDecision: PermissionDecision,
    options: ExecuteOptions = {},
  ): Promise<ExecutionRecord> {
    this.assertPersistedPermissionDecision(request, permissionDecision);
    if (permissionDecision.decision !== "ALLOW") {
      throw new Error("Execution requires an ALLOW permission decision");
    }

    const startedAt = Date.now();
    try {
      const handlerResult = await this.#runHandler(request);
      const completed = options.afterHandler
        ? await options.afterHandler(handlerResult)
        : { result: handlerResult };

      return this.#writeExecutionRecord({
        request,
        result: completed.result,
        status: completed.status ?? "SUCCESS",
        permissionDecisionId: permissionDecision.decisionId,
        settlementId: completed.settlementId,
        chainType: completed.chainType,
        chainId: completed.chainId,
        txHash: completed.txHash,
        walletAddress: completed.walletAddress,
        gasUsed: completed.gasUsed,
        blockNumber: completed.blockNumber,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      return this.#writeExecutionRecord({
        request,
        result: { error: error instanceof Error ? error.message : "Execution failed" },
        status: "FAILED",
        permissionDecisionId: permissionDecision.decisionId,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  recordDenied(
    request: ExecutionRequest,
    permissionDecision: PermissionDecision,
    result: Record<string, unknown>,
  ): ExecutionRecord {
    this.assertPersistedPermissionDecision(request, permissionDecision);
    return this.#writeExecutionRecord({
      request,
      result,
      status: "DENIED",
      permissionDecisionId: permissionDecision.decisionId,
      durationMs: 0,
    });
  }

  #writeExecutionRecord(input: {
    request: ExecutionRequest;
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
    durationMs: number;
    zkProof?: string;
    teeAttestation?: string;
  }): ExecutionRecord {
    const executionId = input.request.executionId ?? newId("exec");
    const createdAt = nowIso();
    const baseRecord: Omit<ExecutionRecord, "merkleLeafHash"> = {
      executionId,
      agentId: input.request.agentId,
      targetDid: input.request.targetDid,
      action: input.request.action,
      params: input.request.params,
      rawInput: input.request.rawInput,
      result: input.result,
      status: input.status,
      permissionDecisionId: input.permissionDecisionId,
      settlementId: input.settlementId,
      chainType: input.chainType,
      chainId: input.chainId,
      txHash: input.txHash,
      walletAddress: input.walletAddress,
      gasUsed: input.gasUsed,
      blockNumber: input.blockNumber,
      feedback: undefined,
      merkleRoot: undefined,
      merkleIndex: undefined,
      zkProof: input.zkProof,
      teeAttestation: input.teeAttestation,
      durationMs: input.durationMs,
      createdAt,
      schemaVersion: input.request.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
      apiVersion: input.request.apiVersion ?? DEFAULT_API_VERSION,
    };
    const merkleLeafHash = createExecutionLeafHash(baseRecord);

    this.database.db
      .prepare(
        `
          INSERT INTO execution_records (
            execution_id, agent_id, target_did, action, params, raw_input,
            result, status, permission_decision_id, settlement_id,
            chain_type, chain_id, tx_hash, wallet_address, gas_used, block_number,
            feedback,
            merkle_leaf_hash, merkle_root, merkle_index, zk_proof,
            tee_attestation, duration_ms, schema_version, api_version, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        executionId,
        input.request.agentId,
        input.request.targetDid ?? null,
        input.request.action,
        stableJson(input.request.params),
        input.request.rawInput ?? null,
        stableJson(input.result),
        input.status,
        input.permissionDecisionId,
        input.settlementId ?? null,
        input.chainType ?? null,
        input.chainId ?? null,
        input.txHash ?? null,
        input.walletAddress ?? null,
        input.gasUsed ?? null,
        input.blockNumber ?? null,
        null,
        merkleLeafHash,
        null,
        null,
        input.zkProof ?? null,
        input.teeAttestation ?? null,
        input.durationMs,
        baseRecord.schemaVersion,
        baseRecord.apiVersion,
        createdAt,
      );

    const leaves = this.#getLedgerLeaves();
    const merkleIndex = leaves.findIndex((leaf) => leaf.executionId === executionId);
    const merkleRoot = buildMerkleRoot(leaves.map((leaf) => leaf.hash));

    this.database.db
      .prepare(
        `
          UPDATE execution_records
          SET merkle_root = ?, merkle_index = ?
          WHERE execution_id = ?
        `,
      )
      .run(merkleRoot, merkleIndex, executionId);

    return {
      ...baseRecord,
      merkleLeafHash,
      merkleRoot,
      merkleIndex,
    };
  }

  getExecutionRecord(executionId: string): ExecutionRecord | undefined {
    const row = this.database.db
      .prepare("SELECT * FROM execution_records WHERE execution_id = ?")
      .get(executionId) as ExecutionRow | undefined;

    return row ? mapExecutionRow(row) : undefined;
  }

  getExecutionByIdempotency(
    idempotencyKey: string,
    agentId: string,
  ): ExecutionRecord | undefined {
    const row = this.database.db
      .prepare(
        `
          SELECT er.*
          FROM idempotency_keys ik
          JOIN execution_records er ON er.execution_id = ik.execution_id
          WHERE ik.idempotency_key = ? AND ik.agent_id = ?
        `,
      )
      .get(scopedIdempotencyKey(idempotencyKey, agentId), agentId) as ExecutionRow | undefined;

    return row ? mapExecutionRow(row) : undefined;
  }

  recordIdempotency(idempotencyKey: string, executionId: string, agentId: string): void {
    this.database.db
      .prepare(
        `
          INSERT INTO idempotency_keys (idempotency_key, execution_id, agent_id, created_at)
          VALUES (?, ?, ?, ?)
        `,
      )
      .run(scopedIdempotencyKey(idempotencyKey, agentId), executionId, agentId, nowIso());
  }

  generateMerkleProof(executionId: string): MerkleProof {
    return buildMerkleProof(executionId, this.#getLedgerLeaves());
  }

  verifyMerkleProof(proof: MerkleProof): boolean {
    return verifyProof(proof);
  }

  async #runHandler(request: ExecutionRequest): Promise<Record<string, unknown>> {
    const handler = this.#findHandler(request.action);
    if (!handler) {
      throw new Error(`No execution handler registered for action: ${request.action}`);
    }

    return handler(request);
  }

  #findHandler(action: string): ExecutionHandler | undefined {
    const exact = this.handlers.get(action);
    if (exact) {
      return exact;
    }

    for (const [pattern, handler] of this.handlers.entries()) {
      if (pattern.endsWith("*") && action.startsWith(pattern.slice(0, -1))) {
        return handler;
      }
    }

    return undefined;
  }

  #getLedgerLeaves(): Array<{ executionId: string; hash: string }> {
    const rows = this.database.db
      .prepare(
        `
          SELECT execution_id, merkle_leaf_hash
          FROM execution_records
          ORDER BY created_at ASC, execution_id ASC
        `,
      )
      .all() as Array<{ execution_id: string; merkle_leaf_hash: string }>;

    return rows.map((row) => ({
      executionId: row.execution_id,
      hash: row.merkle_leaf_hash,
    }));
  }

  private assertPersistedPermissionDecision(
    request: ExecutionRequest,
    permissionDecision: PermissionDecision,
  ): void {
    const row = this.database.db
      .prepare(
        `
          SELECT decision_id, agent_id, action, decision
          FROM permission_audits
          WHERE decision_id = ?
        `,
      )
      .get(permissionDecision.decisionId) as PermissionAuditRow | undefined;

    if (!row) {
      throw new Error("Permission decision must be persisted before execution");
    }

    if (
      row.agent_id !== request.agentId ||
      row.action !== request.action ||
      row.decision !== permissionDecision.decision
    ) {
      throw new Error("Permission decision does not match execution request");
    }
  }
}

function scopedIdempotencyKey(idempotencyKey: string, agentId: string): string {
  return `${agentId}:${idempotencyKey}`;
}

function createExecutionLeafHash(
  record: Omit<ExecutionRecord, "merkleLeafHash">,
): string {
  return sha256Hex({
    executionId: record.executionId,
    agentId: record.agentId,
    targetDid: record.targetDid,
    action: record.action,
    params: record.params,
    rawInput: record.rawInput,
    result: record.result,
    status: record.status,
    permissionDecisionId: record.permissionDecisionId,
    settlementId: record.settlementId,
    chainType: record.chainType,
    chainId: record.chainId,
    txHash: record.txHash,
    walletAddress: record.walletAddress,
    gasUsed: record.gasUsed,
    blockNumber: record.blockNumber,
    zkProof: record.zkProof,
    teeAttestation: record.teeAttestation,
    durationMs: record.durationMs,
    createdAt: record.createdAt,
    schemaVersion: record.schemaVersion,
    apiVersion: record.apiVersion,
  });
}

function mapExecutionRow(row: ExecutionRow): ExecutionRecord {
  return {
    executionId: row.execution_id,
    agentId: row.agent_id,
    targetDid: row.target_did ?? undefined,
    action: row.action,
    params: parseJson<Record<string, unknown>>(row.params, {}),
    rawInput: row.raw_input ?? undefined,
    result: parseJson<Record<string, unknown>>(row.result, {}),
    status: row.status,
    permissionDecisionId: row.permission_decision_id,
    settlementId: row.settlement_id ?? undefined,
    chainType: row.chain_type ?? undefined,
    chainId: row.chain_id ?? undefined,
    txHash: row.tx_hash ?? undefined,
    walletAddress: row.wallet_address ?? undefined,
    gasUsed: row.gas_used ?? undefined,
    blockNumber: row.block_number ?? undefined,
    feedback: parseJson<Record<string, unknown> | undefined>(row.feedback, undefined),
    merkleLeafHash: row.merkle_leaf_hash,
    merkleRoot: row.merkle_root ?? undefined,
    merkleIndex: row.merkle_index ?? undefined,
    zkProof: row.zk_proof ?? undefined,
    teeAttestation: row.tee_attestation ?? undefined,
    durationMs: row.duration_ms ?? 0,
    createdAt: row.created_at,
    schemaVersion: row.schema_version ?? DEFAULT_SCHEMA_VERSION,
    apiVersion: row.api_version ?? DEFAULT_API_VERSION,
  };
}
