import type { ChainConfig } from "../../../chains/types.js";
import { createMockTxHash, isMockSettlementMode, jsonRpc } from "../common.js";
import type {
  SettlementAdapter,
  SettlementTransferInput,
  SettlementTransferResult,
  TransactionVerification,
} from "../../types.js";

interface EvmReceipt {
  transactionHash?: string;
  status?: string;
  gasUsed?: string;
  blockNumber?: string;
}

export class EvmSettlementAdapter implements SettlementAdapter {
  readonly chainType = "evm" as const;

  constructor(private readonly chain: ChainConfig) {}

  async getBalance(address: string): Promise<string> {
    const balanceHex = await jsonRpc<string>(this.chain.rpcUrl, "eth_getBalance", [
      address,
      "latest",
    ]);
    return BigInt(balanceHex).toString();
  }

  async transfer(input: SettlementTransferInput): Promise<SettlementTransferResult> {
    const txHash =
      input.txHash ??
      (input.signedTransaction
        ? await jsonRpc<string>(this.chain.rpcUrl, "eth_sendRawTransaction", [
            input.signedTransaction,
          ])
        : createMockTxHash({ adapter: "evm", input }));

    const verification = await this.verifyTransaction(txHash);
    return {
      status: verification.status === "FAILED" ? "FAILED" : "COMPLETED",
      txHash,
      chainType: this.chainType,
      chainId: String(this.chain.chainId),
      gasUsed: verification.gasUsed,
      blockNumber: verification.blockNumber,
      raw: verification.raw,
    };
  }

  async verifyTransaction(txHash: string): Promise<TransactionVerification> {
    const receipt = await jsonRpc<EvmReceipt | null>(
      this.chain.rpcUrl,
      "eth_getTransactionReceipt",
      [txHash],
    );

    if (!receipt) {
      return {
        txHash,
        chainType: this.chainType,
        chainId: String(this.chain.chainId),
        status: "PENDING",
      };
    }

    return {
      txHash,
      chainType: this.chainType,
      chainId: String(this.chain.chainId),
      status: receipt.status === "0x0" ? "FAILED" : "SUCCESS",
      gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed).toString() : undefined,
      blockNumber: receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : undefined,
      raw: receipt as Record<string, unknown>,
    };
  }

  async estimateFee(input: SettlementTransferInput): Promise<string> {
    if (isMockSettlementMode() || this.chain.rpcUrl.startsWith("mock://")) {
      return input.rail === "evm-erc20" ? "65000" : "21000";
    }

    return input.rail === "evm-erc20" ? "65000" : "21000";
  }
}
