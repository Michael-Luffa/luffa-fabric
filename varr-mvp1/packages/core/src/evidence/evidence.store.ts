import type { ExecutionReceipt } from "./execution.receipt.ts";
import type { ReceiptRepository } from "../storage/repository.interface.ts";

export class EvidenceStore {
  private readonly receipts: ReceiptRepository;

  constructor(receipts: ReceiptRepository) {
    this.receipts = receipts;
  }

  async append(receipt: ExecutionReceipt): Promise<ExecutionReceipt> {
    return this.receipts.create(receipt);
  }

  async get(receiptId: string): Promise<ExecutionReceipt | undefined> {
    return this.receipts.get(receiptId);
  }

  async list(): Promise<ExecutionReceipt[]> {
    return this.receipts.list();
  }
}
