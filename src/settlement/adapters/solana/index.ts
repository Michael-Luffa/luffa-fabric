import type { ChainConfig } from "../../../chains/types.js";
import { createMockTxHash, jsonRpc } from "../common.js";
import type {
  SettlementAdapter,
  SettlementTransferInput,
  SettlementTransferResult,
  TransactionVerification,
} from "../../types.js";

interface SolanaSignatureStatus {
  confirmationStatus?: string;
  confirmations?: number | null;
  err?: unknown;
  slot?: number;
}

export class SolanaSettlementAdapter implements SettlementAdapter {
  readonly chainType = "solana" as const;

  constructor(private readonly chain: ChainConfig) {}

  async getBalance(address: string): Promise<string> {
    const response = await jsonRpc<{ value: number }>(this.chain.rpcUrl, "getBalance", [
      address,
    ]);
    return String(response.value);
  }

  async transfer(input: SettlementTransferInput): Promise<SettlementTransferResult> {
    const txHash =
      input.txHash ??
      (input.signedTransaction
        ? await jsonRpc<string>(this.chain.rpcUrl, "sendTransaction", [
            input.signedTransaction,
            { encoding: "base64" },
          ])
        : createMockTxHash({ adapter: "solana", input }));

    const verification = await this.verifyTransaction(txHash);
    return {
      status: verification.status === "FAILED" ? "FAILED" : "COMPLETED",
      txHash,
      chainType: this.chainType,
      chainId: String(this.chain.chainId),
      blockNumber: verification.blockNumber,
      raw: verification.raw,
    };
  }

  async verifyTransaction(txHash: string): Promise<TransactionVerification> {
    const response = await jsonRpc<{ value: Array<SolanaSignatureStatus | null> }>(
      this.chain.rpcUrl,
      "getSignatureStatuses",
      [[txHash]],
    );
    const status = response.value[0];
    if (!status) {
      return {
        txHash,
        chainType: this.chainType,
        chainId: String(this.chain.chainId),
        status: "NOT_FOUND",
      };
    }

    return {
      txHash,
      chainType: this.chainType,
      chainId: String(this.chain.chainId),
      status: status.err ? "FAILED" : "SUCCESS",
      confirmations: status.confirmations ?? undefined,
      blockNumber: status.slot,
      raw: status as Record<string, unknown>,
    };
  }

  async estimateFee(): Promise<string> {
    return "5000";
  }
}
