import type { LaelDb } from "../db/index.js";
import { getChainConfig, getDefaultChainForType } from "../chains/registry.js";
import type { ChainType } from "../chains/types.js";
import { newId, nowIso } from "../utils.js";
import { EndlessSettlementAdapter, EvmSettlementAdapter, SolanaSettlementAdapter } from "./adapters/index.js";
import type {
  SettlementAdapter,
  SettlementAsset,
  SettlementInstruction,
  SettlementRecord,
  SettlementStatus,
  SettlementTransferInput,
  TransactionVerification,
} from "./types.js";

const DEFAULT_SCHEMA_VERSION = "1.0";
const DEFAULT_API_VERSION = "v1";

interface AccountRow {
  account_id: string;
  did: string;
  asset: SettlementAsset;
  balance: number;
  frozen: number;
}

interface SettlementRow {
  settlement_id: string;
  execution_id: string;
  payer_did: string;
  payee_did: string;
  asset: SettlementAsset;
  amount: number;
  rail: SettlementRecord["rail"];
  status: SettlementStatus;
  transaction_ref: string | null;
  chain_type: ChainType | null;
  chain_id: string | null;
  tx_hash: string | null;
  wallet_address: string | null;
  gas_used: string | null;
  block_number: number | null;
  created_at: string;
  schema_version: string | null;
  api_version: string | null;
}

export class SettlementService {
  private readonly adapters = new Map<ChainType, SettlementAdapter>();

  constructor(private readonly database: LaelDb) {}

  registerAdapter(adapter: SettlementAdapter): void {
    this.adapters.set(adapter.chainType, adapter);
  }

  registerDefaultAdapters(): void {
    const evmChain = getChainConfig("BASE_SEPOLIA");
    const solanaChain = getChainConfig("SOLANA_DEVNET");
    const endlessChain = getChainConfig("ENDLESS_TESTNET");
    if (evmChain && process.env.ENABLE_EVM !== "false") {
      this.registerAdapter(new EvmSettlementAdapter(evmChain));
    }
    if (solanaChain && process.env.ENABLE_SOLANA !== "false") {
      this.registerAdapter(new SolanaSettlementAdapter(solanaChain));
    }
    if (endlessChain && process.env.ENABLE_ENDLESS !== "false") {
      this.registerAdapter(new EndlessSettlementAdapter(endlessChain));
    }
  }

  createAccount(did: string, asset: SettlementAsset = "LUFFA_POINTS"): string {
    const existing = this.getAccount(did, asset);
    if (existing) {
      return existing.account_id;
    }

    const accountId = newId("acct");
    this.database.db
      .prepare(
        `
          INSERT INTO accounts (account_id, did, asset, balance, frozen, created_at)
          VALUES (?, ?, ?, 0, 0, ?)
        `,
      )
      .run(accountId, did, asset, nowIso());

    return accountId;
  }

  credit(did: string, asset: SettlementAsset, amount: number): void {
    if (asset !== "LUFFA_POINTS") {
      throw new Error("Only LUFFA_POINTS can be credited in the local ledger");
    }
    assertPositiveAmount(amount);
    this.database.transaction(() => {
      this.createAccount(did, asset);
      const account = this.requireAccount(did, asset);
      if (account.frozen === 1) {
        throw new Error("Account is frozen");
      }
      this.database.db
        .prepare("UPDATE accounts SET balance = balance + ? WHERE did = ? AND asset = ?")
        .run(amount, did, asset);
    });
  }

  transfer(instruction: SettlementInstruction): SettlementRecord {
    if (instruction.rail !== "luffa-points") {
      throw new Error("Use settle() for chain settlement rails");
    }

    return this.transferLuffaPoints(instruction);
  }

  async settle(instruction: SettlementInstruction): Promise<SettlementRecord> {
    if (instruction.rail === "luffa-points") {
      return this.transferLuffaPoints(instruction);
    }

    return this.settleWithAdapter(instruction);
  }

  async verifyTransaction(
    txHash: string,
    chainType?: ChainType,
    chainId?: string,
  ): Promise<TransactionVerification> {
    const adapter = this.requireAdapter(chainType ?? inferChainType(chainId) ?? "evm");
    return adapter.verifyTransaction(txHash);
  }

  getSettlementRecord(settlementId: string): SettlementRecord | undefined {
    const row = this.database.db
      .prepare("SELECT * FROM settlement_records WHERE settlement_id = ?")
      .get(settlementId) as SettlementRow | undefined;

    return row ? mapSettlementRow(row) : undefined;
  }

  getSettlementByTxHash(txHash: string): SettlementRecord | undefined {
    const row = this.database.db
      .prepare("SELECT * FROM settlement_records WHERE tx_hash = ?")
      .get(txHash) as SettlementRow | undefined;

    return row ? mapSettlementRow(row) : undefined;
  }

  getBalance(did: string, asset: SettlementAsset): number {
    return this.getAccount(did, asset)?.balance ?? 0;
  }

  private transferLuffaPoints(instruction: SettlementInstruction): SettlementRecord {
    assertPositiveAmount(instruction.amount);

    const settlementId = instruction.settlementId ?? newId("settle");
    const existing = this.getSettlementRecord(settlementId);
    if (existing) {
      return existing;
    }
    const createdAt = nowIso();

    try {
      const record = this.database.transaction(() => {
        this.createAccount(instruction.payeeDid, instruction.asset);
        const payer = this.requireAccount(instruction.payerDid, instruction.asset);
        const payee = this.requireAccount(instruction.payeeDid, instruction.asset);

        if (payer.frozen === 1 || payee.frozen === 1) {
          throw new Error("Account is frozen");
        }

        if (payer.balance < instruction.amount) {
          throw new Error("Insufficient balance");
        }

        this.database.db
          .prepare("UPDATE accounts SET balance = balance - ? WHERE did = ? AND asset = ?")
          .run(instruction.amount, instruction.payerDid, instruction.asset);
        this.database.db
          .prepare("UPDATE accounts SET balance = balance + ? WHERE did = ? AND asset = ?")
          .run(instruction.amount, instruction.payeeDid, instruction.asset);

        const completed: SettlementRecord = {
          settlementId,
          executionId: instruction.executionId,
          payerDid: instruction.payerDid,
          payeeDid: instruction.payeeDid,
          asset: instruction.asset,
          amount: instruction.amount,
          rail: instruction.rail,
          status: "COMPLETED",
          transactionRef: `luffa-points:${settlementId}`,
          chainType: instruction.chainType,
          chainId: instruction.chainId,
          txHash: instruction.txHash,
          walletAddress: instruction.walletAddress,
          createdAt,
          schemaVersion: instruction.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
          apiVersion: instruction.apiVersion ?? DEFAULT_API_VERSION,
        };
        this.insertSettlement(completed);
        return completed;
      });

      return record;
    } catch (error) {
      const rolledBack: SettlementRecord = {
        settlementId,
        executionId: instruction.executionId,
        payerDid: instruction.payerDid,
        payeeDid: instruction.payeeDid,
        asset: instruction.asset,
        amount: instruction.amount,
        rail: instruction.rail,
        status: "ROLLED_BACK",
        transactionRef: error instanceof Error ? error.message : "Settlement rolled back",
        chainType: instruction.chainType,
        chainId: instruction.chainId,
        txHash: instruction.txHash,
        walletAddress: instruction.walletAddress,
        createdAt: nowIso(),
        schemaVersion: instruction.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
        apiVersion: instruction.apiVersion ?? DEFAULT_API_VERSION,
      };
      this.insertSettlement(rolledBack);
      return rolledBack;
    }
  }

  private async settleWithAdapter(instruction: SettlementInstruction): Promise<SettlementRecord> {
    assertPositiveAmount(instruction.amount);

    const settlementId = instruction.settlementId ?? newId("settle");
    const existing = this.getSettlementRecord(settlementId);
    if (existing) {
      return existing;
    }

    const createdAt = nowIso();
    try {
      const chainType = instruction.chainType ?? inferRailChainType(instruction.rail);
      if (instruction.chainKey && !getChainConfig(instruction.chainKey)) {
        throw new Error(`Unsupported chain: ${instruction.chainKey}`);
      }
      if (instruction.chainId && !getChainConfig(instruction.chainId)) {
        throw new Error(`Unsupported chain: ${instruction.chainId}`);
      }
      const chain =
        (instruction.chainKey ? getChainConfig(instruction.chainKey) : undefined) ??
        (instruction.chainId ? getChainConfig(instruction.chainId) : undefined) ??
        getDefaultChainForType(chainType);

      if (!chain) {
        throw new Error(`Unsupported chain for ${chainType}`);
      }

      if (instruction.rail === "evm-erc20" && !instruction.tokenAddress) {
        throw new Error("Token contract address is required for ERC20 settlement");
      }

      if (instruction.rail === "solana-spl" && !instruction.tokenAddress) {
        throw new Error("Token mint address is required for SPL settlement");
      }

      if (instruction.metadata?.forceFail === true) {
        throw new Error("Mock transfer failed");
      }

      const adapter = this.requireAdapter(chain.chainType);
      const input: SettlementTransferInput = {
        settlementId,
        chainKey: chain.chainKey,
        chainType: chain.chainType,
        chainId: String(chain.chainId),
        asset: instruction.asset,
        rail: instruction.rail,
        amount: String(instruction.amount),
        fromAddress:
          instruction.fromAddress ?? instruction.walletAddress ?? instruction.payerDid,
        toAddress: instruction.toAddress ?? instruction.payeeDid,
        tokenAddress: instruction.tokenAddress,
        txHash: instruction.txHash,
        signedTransaction: instruction.signedTransaction,
        metadata: instruction.metadata,
      };
      const result = await adapter.transfer(input);
      const record: SettlementRecord = {
        settlementId,
        executionId: instruction.executionId,
        payerDid: instruction.payerDid,
        payeeDid: instruction.payeeDid,
        asset: instruction.asset,
        amount: instruction.amount,
        rail: instruction.rail,
        status: result.status,
        transactionRef: `${chain.chainType}:${result.txHash}`,
        chainType: result.chainType,
        chainId: result.chainId,
        txHash: result.txHash,
        walletAddress: instruction.walletAddress ?? instruction.fromAddress,
        gasUsed: result.gasUsed,
        blockNumber: result.blockNumber,
        createdAt,
        schemaVersion: instruction.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
        apiVersion: instruction.apiVersion ?? DEFAULT_API_VERSION,
      };
      this.insertSettlement(record);
      return record;
    } catch (error) {
      const rolledBack: SettlementRecord = {
        settlementId,
        executionId: instruction.executionId,
        payerDid: instruction.payerDid,
        payeeDid: instruction.payeeDid,
        asset: instruction.asset,
        amount: instruction.amount,
        rail: instruction.rail,
        status: "ROLLED_BACK",
        transactionRef: error instanceof Error ? error.message : "Settlement rolled back",
        chainType: instruction.chainType,
        chainId: instruction.chainId,
        txHash: instruction.txHash,
        walletAddress: instruction.walletAddress ?? instruction.fromAddress,
        createdAt: nowIso(),
        schemaVersion: instruction.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
        apiVersion: instruction.apiVersion ?? DEFAULT_API_VERSION,
      };
      this.insertSettlement(rolledBack);
      return rolledBack;
    }
  }

  private getAccount(did: string, asset: SettlementAsset): AccountRow | undefined {
    return this.database.db
      .prepare("SELECT * FROM accounts WHERE did = ? AND asset = ?")
      .get(did, asset) as AccountRow | undefined;
  }

  private requireAccount(did: string, asset: SettlementAsset): AccountRow {
    const account = this.getAccount(did, asset);
    if (!account) {
      throw new Error(`Account not found for ${did} ${asset}`);
    }
    return account;
  }

  private insertSettlement(record: SettlementRecord): void {
    this.database.db
      .prepare(
        `
          INSERT INTO settlement_records (
            settlement_id, execution_id, payer_did, payee_did, asset, amount,
            rail, status, transaction_ref, chain_type, chain_id, tx_hash,
            wallet_address, gas_used, block_number, schema_version, api_version, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        record.settlementId,
        record.executionId,
        record.payerDid,
        record.payeeDid,
        record.asset,
        record.amount,
        record.rail,
        record.status,
        record.transactionRef ?? null,
        record.chainType ?? null,
        record.chainId ?? null,
        record.txHash ?? null,
        record.walletAddress ?? null,
        record.gasUsed ?? null,
        record.blockNumber ?? null,
        record.schemaVersion,
        record.apiVersion,
        record.createdAt,
      );
  }

  private requireAdapter(chainType: ChainType): SettlementAdapter {
    const adapter = this.adapters.get(chainType);
    if (!adapter) {
      throw new Error(`Settlement adapter not registered for ${chainType}`);
    }
    return adapter;
  }
}

export function mapSettlementRow(row: SettlementRow): SettlementRecord {
  return {
    settlementId: row.settlement_id,
    executionId: row.execution_id,
    payerDid: row.payer_did,
    payeeDid: row.payee_did,
    asset: row.asset,
    amount: row.amount,
    rail: row.rail,
    status: row.status,
    transactionRef: row.transaction_ref ?? undefined,
    chainType: row.chain_type ?? undefined,
    chainId: row.chain_id ?? undefined,
    txHash: row.tx_hash ?? undefined,
    walletAddress: row.wallet_address ?? undefined,
    gasUsed: row.gas_used ?? undefined,
    blockNumber: row.block_number ?? undefined,
    createdAt: row.created_at,
    schemaVersion: row.schema_version ?? DEFAULT_SCHEMA_VERSION,
    apiVersion: row.api_version ?? DEFAULT_API_VERSION,
  };
}

function assertPositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be positive");
  }
}

function inferRailChainType(rail: SettlementInstruction["rail"]): ChainType {
  if (rail.startsWith("solana-")) {
    return "solana";
  }
  return "evm";
}

function inferChainType(chainId: string | undefined): ChainType | undefined {
  if (!chainId) {
    return undefined;
  }

  return getChainConfig(chainId)?.chainType;
}
