import { sha256Hex } from "../../utils.js";

export async function jsonRpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[] = [],
): Promise<T> {
  if (isMockSettlementMode() || rpcUrl.startsWith("mock://")) {
    return mockRpc<T>(rpcUrl, method, params);
  }

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };
  if (payload.error) {
    throw new Error(payload.error.message ?? `RPC ${method} failed`);
  }
  return payload.result as T;
}

export function createMockTxHash(input: unknown): string {
  return `mock_${sha256Hex(input).slice(0, 64)}`;
}

export function isMockSettlementMode(): boolean {
  return (process.env.LAEL_SETTLEMENT_MODE ?? "mock") === "mock";
}

function mockRpc<T>(rpcUrl: string, method: string, params: unknown[]): T {
  const txHash = String(params[0] ?? createMockTxHash({ rpcUrl, method, params }));

  switch (method) {
    case "eth_getBalance":
      return "0xde0b6b3a7640000" as T;
    case "eth_sendRawTransaction":
      return createMockTxHash({ rpcUrl, method, raw: params[0] }) as T;
    case "eth_getTransactionReceipt":
      return {
        transactionHash: txHash,
        status: "0x1",
        gasUsed: "0x5208",
        blockNumber: "0x2a",
      } as T;
    case "getBalance":
      return { value: 1_000_000_000 } as T;
    case "sendTransaction":
      return createMockTxHash({ rpcUrl, method, raw: params[0] }) as T;
    case "getSignatureStatuses":
      return {
        value: [
          {
            confirmationStatus: "confirmed",
            confirmations: 1,
            err: null,
            slot: 42,
          },
        ],
      } as T;
    default:
      return {} as T;
  }
}
