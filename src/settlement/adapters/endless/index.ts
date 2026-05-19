import type { ChainConfig } from "../../../chains/types.js";
import { createMockTxHash } from "../common.js";
import type {
  SettlementAdapter,
  SettlementTransferInput,
  SettlementTransferResult,
  TransactionVerification,
} from "../../types.js";

export class EndlessSettlementAdapter implements SettlementAdapter {
  readonly chainType = "endless" as const;

  constructor(private readonly chain: ChainConfig) {}

  async getBalance(): Promise<string> {
    return "0";
  }

  async transfer(input: SettlementTransferInput): Promise<SettlementTransferResult> {
    const txHash = input.txHash ?? createMockTxHash({ adapter: "endless", input });
    return {
      status: "COMPLETED",
      txHash,
      chainType: this.chainType,
      chainId: String(this.chain.chainId),
      raw: {
        mode: "adapter-abstraction",
        rail: "luffa-wallet-proxy-reserved",
      },
    };
  }

  async verifyTransaction(txHash: string): Promise<TransactionVerification> {
    return {
      txHash,
      chainType: this.chainType,
      chainId: String(this.chain.chainId),
      status: txHash ? "SUCCESS" : "NOT_FOUND",
      raw: {
        mode: "adapter-abstraction",
      },
    };
  }

  async estimateFee(): Promise<string> {
    return "0";
  }
}
