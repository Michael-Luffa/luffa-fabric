import { createDb, type DbOptions, type LaelDb } from "../db/index.js";
import { getChainConfig, listChains } from "../chains/index.js";
import type { ChainConfig } from "../chains/index.js";
import { ExecutionService } from "../execution/index.js";
import type { ExecutionRecord, ExecutionRequest } from "../execution/types.js";
import { IdentityService } from "../identity/index.js";
import type {
  AgentIdentifier,
  CapabilityToken,
  IssueCapabilityTokenInput,
  RegisterAgentInput,
  UpdateAgentMetadataInput,
} from "../identity/types.js";
import { LearningService } from "../learning/index.js";
import type { Reputation, RLHFExportRecord } from "../learning/types.js";
import { PermissionService } from "../permission/index.js";
import type { CreatePolicyInput, PermissionPolicy } from "../permission/types.js";
import { SettlementService } from "../settlement/index.js";
import type {
  SettlementAsset,
  SettlementInstruction,
  SettlementRail,
  SettlementRecord,
  TransactionVerification,
} from "../settlement/types.js";
import { WalletService } from "../wallet/index.js";
import type {
  ConnectWalletInput,
  ConnectWalletResult,
  VerifyWalletInput,
  WalletBinding,
} from "../wallet/index.js";
import { newId, sha256Hex } from "../utils.js";

export interface LaelOptions extends DbOptions {
  db?: LaelDb;
}

export interface InvokeResult extends ExecutionRecord {
  settlementStatus?: SettlementRecord["status"];
  idempotent?: boolean;
}

export class LAEL {
  readonly db: LaelDb;
  readonly identity: IdentityService;
  readonly permission: PermissionService;
  readonly execution: ExecutionService;
  readonly settlement: SettlementService;
  readonly learning: LearningService;
  readonly wallet: WalletService;

  constructor(options: LaelOptions = {}) {
    this.db = options.db ?? createDb({ path: options.path });
    this.identity = new IdentityService(this.db);
    this.permission = new PermissionService(this.db);
    this.execution = new ExecutionService(this.db);
    this.settlement = new SettlementService(this.db);
    this.settlement.registerDefaultAdapters();
    this.learning = new LearningService(this.db);
    this.wallet = new WalletService(this.db);
  }

  registerAgent(input: RegisterAgentInput): Promise<AgentIdentifier> {
    return this.identity.registerAgent(input);
  }

  resolveAgent(agentId: string): Promise<AgentIdentifier> {
    return this.identity.resolveAgent(agentId);
  }

  updateAgentMetadata(
    agentId: string,
    input: UpdateAgentMetadataInput,
  ): Promise<AgentIdentifier> {
    return this.identity.updateAgentMetadata(agentId, input);
  }

  deactivateAgent(agentId: string): Promise<AgentIdentifier> {
    return this.identity.deactivateAgent(agentId);
  }

  createPolicy(input: CreatePolicyInput): Promise<PermissionPolicy> {
    return this.permission.createPolicy(input);
  }

  connectWallet(input: ConnectWalletInput): ConnectWalletResult {
    return this.wallet.connect(input);
  }

  verifyWallet(input: VerifyWalletInput): Promise<WalletBinding> {
    return this.wallet.verify(input);
  }

  getWallets(ownerRef: string): WalletBinding[] {
    return this.wallet.list(ownerRef);
  }

  getSupportedChains(): ChainConfig[] {
    return listChains();
  }

  issueCapabilityToken(input: IssueCapabilityTokenInput): Promise<CapabilityToken> {
    return this.identity.issueCapabilityToken(input);
  }

  async transferSettlement(
    instruction: SettlementInstruction & { idempotencyKey?: string },
  ): Promise<SettlementRecord> {
    const settlementId =
      instruction.settlementId ??
      (instruction.idempotencyKey
        ? `settle_${sha256Hex({
            idempotencyKey: instruction.idempotencyKey,
            executionId: instruction.executionId,
          }).slice(0, 32)}`
        : undefined);
    return this.settlement.settle({ ...instruction, settlementId });
  }

  verifyTransaction(
    txHash: string,
    chainType?: SettlementRecord["chainType"],
    chainId?: string,
  ): Promise<TransactionVerification> {
    return this.settlement.verifyTransaction(txHash, chainType, chainId);
  }

  async invoke(request: ExecutionRequest): Promise<InvokeResult> {
    const agent = await this.identity.resolveAgent(request.agentId);
    const existing = this.execution.getExecutionByIdempotency(
      request.idempotencyKey,
      agent.internalId,
    );
    if (existing) {
      return { ...existing, idempotent: true };
    }

    const executionId = request.executionId ?? newId("exec");
    const requestWithId: ExecutionRequest = { ...request, executionId };

    if (agent.status !== "active") {
      const executableRequest = { ...requestWithId, agentId: agent.internalId };
      const decision = this.permission.recordDeny(
        {
          agentId: agent.internalId,
          ownerRef: agent.ownerRef,
          action: requestWithId.action,
          params: requestWithId.params,
          context: requestWithId.context,
          riskLevel: agent.riskLevel,
        },
        "Agent inactive",
      );
      const record = this.execution.recordDenied(executableRequest, decision, {
        error: "Agent inactive",
      });
      this.execution.recordIdempotency(requestWithId.idempotencyKey, record.executionId, agent.internalId);
      return record;
    }

    const capabilityError = await this.getCapabilityError(agent, requestWithId);

    const decision = await this.permission.evaluatePermission({
      agentId: agent.internalId,
      ownerRef: agent.ownerRef,
      action: requestWithId.action,
      params: requestWithId.params,
      context: requestWithId.context,
      riskLevel: agent.riskLevel,
    });

    if (decision.decision !== "ALLOW") {
      const executableRequest = { ...requestWithId, agentId: agent.internalId };
      const record = this.execution.recordDenied(
        executableRequest,
        decision,
        {
          error: decision.reason ?? "Permission denied",
          decision: decision.decision,
          requiresConfirmation: decision.requiresConfirmation,
        },
      );
      this.execution.recordIdempotency(requestWithId.idempotencyKey, record.executionId, agent.internalId);
      return record;
    }

    if (capabilityError) {
      const executableRequest = { ...requestWithId, agentId: agent.internalId };
      const record = this.execution.recordDenied(
        executableRequest,
        decision,
        { error: capabilityError },
      );
      this.execution.recordIdempotency(requestWithId.idempotencyKey, record.executionId, agent.internalId);
      return record;
    }

    const walletBindingError = this.getWalletBindingError(agent, requestWithId, executionId);
    if (walletBindingError) {
      const executableRequest = { ...requestWithId, agentId: agent.internalId };
      const denyDecision = this.permission.recordDeny(
        {
          agentId: agent.internalId,
          ownerRef: agent.ownerRef,
          action: requestWithId.action,
          params: requestWithId.params,
          context: requestWithId.context,
          riskLevel: agent.riskLevel,
        },
        walletBindingError,
      );
      const record = this.execution.recordDenied(
        executableRequest,
        denyDecision,
        { error: walletBindingError },
      );
      this.execution.recordIdempotency(requestWithId.idempotencyKey, record.executionId, agent.internalId);
      return record;
    }

    let settlementRecord: SettlementRecord | undefined;
    const record = await this.execution.execute(
      {
        ...requestWithId,
        agentId: agent.internalId,
      },
      decision,
      {
        afterHandler: async (result) => {
          const enrichedResult =
            requestWithId.action === "luffa.query_wallet"
              ? {
                  ...result,
                  balance: this.settlement.getBalance(
                    String(requestWithId.params.did ?? requestWithId.targetDid ?? agent.ownerRef),
                    "LUFFA_POINTS",
                  ),
                }
              : result;

          const settlementInstruction = this.buildSettlementInstruction(
            requestWithId,
            executionId,
            agent,
          );

          if (settlementInstruction) {
            settlementRecord = await this.settlement.settle(settlementInstruction);
          }

          const status = settlementRecord?.status === "ROLLED_BACK" ? "FAILED" : "SUCCESS";
          const finalResult =
            settlementRecord && settlementRecord.status === "ROLLED_BACK"
              ? {
                  ...enrichedResult,
                  settlement: {
                    status: settlementRecord.status,
                    error: settlementRecord.transactionRef,
                  },
                }
              : enrichedResult;

          return {
            result: finalResult,
            status,
            settlementId: settlementRecord?.settlementId,
            chainType: settlementRecord?.chainType,
            chainId: settlementRecord?.chainId,
            txHash: settlementRecord?.txHash,
            walletAddress: settlementRecord?.walletAddress,
            gasUsed: settlementRecord?.gasUsed,
            blockNumber: settlementRecord?.blockNumber,
          };
        },
      },
    );
    this.execution.recordIdempotency(requestWithId.idempotencyKey, record.executionId, agent.internalId);
    return { ...record, settlementStatus: settlementRecord?.status };
  }

  submitFeedback(executionId: string, score: number, comment?: string): Reputation {
    this.learning.submitFeedback(executionId, score, comment);
    const execution = this.getExecutionRecord(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    return this.learning.getReputation(execution.agentId);
  }

  getExecutionRecord(executionId: string): ExecutionRecord | undefined {
    return this.execution.getExecutionRecord(executionId);
  }

  async getAgentProfile(agentId: string): Promise<AgentIdentifier> {
    return this.identity.resolveAgent(agentId);
  }

  getReputation(agentId: string): Reputation {
    return this.learning.getReputation(agentId);
  }

  createAccount(did: string): string {
    return this.settlement.createAccount(did, "LUFFA_POINTS");
  }

  creditAccount(did: string, amount: number): void {
    this.settlement.credit(did, "LUFFA_POINTS", amount);
  }

  getBalance(did: string): number {
    return this.settlement.getBalance(did, "LUFFA_POINTS");
  }

  exportRLHF(): RLHFExportRecord[] {
    return this.learning.exportRLHF();
  }

  close(): void {
    this.db.close();
  }

  private async getCapabilityError(
    agent: AgentIdentifier,
    request: ExecutionRequest,
  ): Promise<string | undefined> {
    if (request.capabilityTokenId) {
      const valid = await this.identity.verifyCapabilityToken(request.capabilityTokenId);
      if (!valid) {
        return "Capability token verification failed";
      }

      try {
        this.identity.assertTokenAuthorizes(request.capabilityTokenId, agent, request.action);
        this.identity.assertTokenSettlementConstraints(
          request.capabilityTokenId,
          deriveSettlementScope(request),
        );
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : "Capability token denied";
      }
    }

    if (agent.capabilities.includes(request.action) || agent.capabilities.includes("*")) {
      return undefined;
    }

    return "Agent capability denied";
  }

  private buildSettlementInstruction(
    request: ExecutionRequest,
    executionId: string,
    agent: AgentIdentifier,
  ): SettlementInstruction | undefined {
    const explicit = objectLike(request.params.settlement) ?? objectLike(request.context?.settlement);
    const source = explicit ?? request.params;

    if (
      !explicit &&
      request.action !== "luffa.trigger_payment" &&
      request.action !== "luffa.reward_user"
    ) {
      return undefined;
    }

    const amount = source.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return undefined;
    }

    const payerDid = String(source.payerDid ?? agent.ownerRef);
    const payeeDid = String(source.payeeDid ?? request.targetDid ?? "");
    if (!payeeDid) {
      return undefined;
    }

    const asset = settlementAsset(source.asset) ?? "LUFFA_POINTS";
    const rail = settlementRail(source.rail) ?? defaultRailForAsset(asset, source.chainType);
    const chainKey = stringValue(source.chainKey) as SettlementInstruction["chainKey"];
    const chainId =
      stringValue(source.chainId) ??
      (chainKey ? String(getChainConfig(chainKey)?.chainId ?? "") : undefined);
    const chainType =
      stringValue(source.chainType) as SettlementInstruction["chainType"] | undefined;

    return {
      settlementId: stringValue(source.settlementId),
      executionId,
      payerDid,
      payeeDid,
      asset,
      amount,
      rail,
      chainKey,
      chainType: chainType ?? getChainConfig(chainId ?? chainKey ?? "")?.chainType,
      chainId,
      fromAddress: stringValue(source.fromAddress),
      toAddress: stringValue(source.toAddress),
      walletAddress: stringValue(source.walletAddress),
      tokenAddress: stringValue(source.tokenAddress),
      txHash: stringValue(source.txHash),
      signedTransaction: stringValue(source.signedTransaction),
      metadata: objectLike(source.metadata),
      schemaVersion: request.schemaVersion,
      apiVersion: request.apiVersion,
    };
  }

  private getWalletBindingError(
    agent: AgentIdentifier,
    request: ExecutionRequest,
    executionId: string,
  ): string | undefined {
    const settlementInstruction = this.buildSettlementInstruction(request, executionId, agent);
    if (!settlementInstruction || settlementInstruction.rail === "luffa-points") {
      return undefined;
    }

    const walletAddress =
      settlementInstruction.walletAddress ?? settlementInstruction.fromAddress;
    if (!walletAddress || !settlementInstruction.chainType) {
      return "Missing wallet binding";
    }

    if (
      !this.wallet.hasVerifiedBinding(
        settlementInstruction.payerDid,
        settlementInstruction.chainType,
        walletAddress,
      )
    ) {
      return "Missing wallet binding";
    }

    return undefined;
  }
}

function objectLike(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function deriveSettlementScope(request: ExecutionRequest): {
  amount?: number;
  asset?: string;
  chain?: string;
} {
  const explicit = objectLike(request.params.settlement) ?? objectLike(request.context?.settlement);
  const source = explicit ?? request.params;
  const amount = numericValue(source.amount);
  const asset = stringValue(source.asset) ?? "LUFFA_POINTS";
  const chain =
    stringValue(source.chainKey) ??
    stringValue(source.chainId) ??
    stringValue(source.chainType) ??
    stringValue(request.context?.chainKey) ??
    stringValue(request.context?.chainId) ??
    stringValue(request.context?.chainType);

  return { amount, asset, chain };
}

function settlementAsset(value: unknown): SettlementAsset | undefined {
  const allowed: SettlementAsset[] = [
    "LUFFA_POINTS",
    "ETH",
    "USDC",
    "USDT",
    "SOL",
    "SPL_TOKEN",
  ];
  return typeof value === "string" && allowed.includes(value as SettlementAsset)
    ? (value as SettlementAsset)
    : undefined;
}

function settlementRail(value: unknown): SettlementRail | undefined {
  const allowed: SettlementRail[] = [
    "luffa-points",
    "evm-native",
    "evm-erc20",
    "solana-native",
    "solana-spl",
  ];
  return typeof value === "string" && allowed.includes(value as SettlementRail)
    ? (value as SettlementRail)
    : undefined;
}

function defaultRailForAsset(asset: SettlementAsset, chainType: unknown): SettlementRail {
  if (asset === "LUFFA_POINTS") {
    return "luffa-points";
  }
  if (asset === "SOL") {
    return "solana-native";
  }
  if (asset === "SPL_TOKEN" || chainType === "solana") {
    return "solana-spl";
  }
  if (asset === "ETH") {
    return "evm-native";
  }
  return "evm-erc20";
}

function numericValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export * from "../identity/types.js";
export * from "../permission/types.js";
export * from "../execution/types.js";
export * from "../settlement/types.js";
export * from "../learning/types.js";
export * from "../wallet/index.js";
export * from "../chains/index.js";
