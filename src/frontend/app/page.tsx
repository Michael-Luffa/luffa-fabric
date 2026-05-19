"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMemo, useState } from "react";
import { baseSepolia, polygonAmoy, sepolia } from "wagmi/chains";
import {
  useAccount,
  useChainId,
  useSendTransaction,
  useSignMessage,
  useSwitchChain
} from "wagmi";
import { parseEther } from "viem";

const API_BASE = process.env.NEXT_PUBLIC_LAEL_API_URL ?? "http://127.0.0.1:3000";

type ExecutionRecord = {
  executionId?: string;
  status?: string;
  settlementStatus?: string;
  txHash?: string;
  merkleRoot?: string;
  result?: Record<string, unknown>;
};

function chainKeyForAsset(asset: string) {
  return asset === "SOL" ? "SOLANA_DEVNET" : "BASE_SEPOLIA";
}

function railForAsset(asset: string) {
  if (asset === "SOL") return "solana-native";
  if (asset === "ETH") return "evm-native";
  return "evm-erc20";
}

export default function Page() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { chains, switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { sendTransactionAsync } = useSendTransaction();
  const solanaWallet = useWallet();
  const { connection } = useConnection();

  const [ownerRef, setOwnerRef] = useState("did:luffa:user_001");
  const [agentId, setAgentId] = useState("");
  const [recipient, setRecipient] = useState("0x0000000000000000000000000000000000000002");
  const [amount, setAmount] = useState("0.001");
  const [asset, setAsset] = useState("USDC");
  const [manualTxHash, setManualTxHash] = useState("");
  const [execution, setExecution] = useState<ExecutionRecord>({});
  const [reputation, setReputation] = useState<Record<string, unknown>>({});
  const [log, setLog] = useState<string[]>([]);

  const activeChain = useMemo(
    () => chains.find((chain) => chain.id === chainId),
    [chains, chainId]
  );

  async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {})
      }
    });
    const body = (await response.json()) as T;
    setLog((items) => [`${init?.method ?? "GET"} ${path} -> ${response.status}`, ...items].slice(0, 8));
    if (!response.ok) {
      throw new Error(JSON.stringify(body));
    }
    return body;
  }

  async function bindEvmWallet() {
    if (!address) return;
    const pending = await callApi<{ bindingId: string; nonce: string; message: string }>(
      "/v2/wallet/connect",
      {
        method: "POST",
        body: JSON.stringify({
          ownerRef,
          walletType: "walletconnect",
          chainType: "evm",
          address
        })
      }
    );
    const signature = await signMessageAsync({ message: pending.message });
    await callApi("/v2/wallet/verify", {
      method: "POST",
      body: JSON.stringify({
        bindingId: pending.bindingId,
        ownerRef,
        walletType: "walletconnect",
        chainType: "evm",
        address,
        nonce: pending.nonce,
        signature
      })
    });
  }

  async function bindSolanaWallet() {
    if (!solanaWallet.publicKey || !solanaWallet.signMessage) return;
    const publicKey = solanaWallet.publicKey.toBase58();
    const pending = await callApi<{ bindingId: string; nonce: string; message: string }>(
      "/v2/wallet/connect",
      {
        method: "POST",
        body: JSON.stringify({
          ownerRef,
          walletType: "phantom",
          chainType: "solana",
          address: publicKey
        })
      }
    );
    const signatureBytes = await solanaWallet.signMessage(new TextEncoder().encode(pending.message));
    const signature = window.btoa(String.fromCharCode(...signatureBytes));
    await callApi("/v2/wallet/verify", {
      method: "POST",
      body: JSON.stringify({
        bindingId: pending.bindingId,
        ownerRef,
        walletType: "phantom",
        chainType: "solana",
        address: publicKey,
        nonce: pending.nonce,
        signature
      })
    });
  }

  async function registerAgentAndPolicy() {
    const registered = await callApi<{ agentId: string }>("/v1/agents/register", {
      method: "POST",
      body: JSON.stringify({
        identityType: "API_KEY",
        externalId: `frontend-agent-${Date.now()}`,
        ownerRef,
        capabilities: ["luffa.create_task"]
      })
    });
    setAgentId(registered.agentId);
    await callApi("/v1/policies", {
      method: "POST",
      body: JSON.stringify({
        ownerRef,
        priority: 10,
        jsonRules: {
          allowedActions: ["luffa.create_task"],
          maxBudgetPerAction: 10,
          allowedAssets: [asset],
          allowedChains: [chainKeyForAsset(asset)]
        }
      })
    });
  }

  async function sendNativeTx() {
    if (!recipient || asset === "SOL") return;
    const txHash = await sendTransactionAsync({
      to: recipient as `0x${string}`,
      value: parseEther(amount)
    });
    setManualTxHash(txHash);
  }

  async function invokeAgentAction() {
    const activeAgent = agentId || (await registerAndReturnAgent());
    const result = await callApi<ExecutionRecord>("/v1/agent/invoke", {
      method: "POST",
      body: JSON.stringify({
        agentId: activeAgent,
        action: "luffa.create_task",
        params: {
          communityId: "community_001",
          title: "Wallet-settled task",
          settlement: {
            payerDid: ownerRef,
            payeeDid: "did:luffa:payee",
            amount: Number(amount),
            asset,
            rail: railForAsset(asset),
            chainKey: chainKeyForAsset(asset),
            walletAddress: asset === "SOL" ? solanaWallet.publicKey?.toBase58() : address,
            toAddress: recipient,
            txHash: manualTxHash || undefined
          }
        },
        idempotencyKey: `frontend-${Date.now()}`,
        context: { budget: Number(amount) }
      })
    });
    setExecution(result);
  }

  async function registerAndReturnAgent() {
    const registered = await callApi<{ agentId: string }>("/v1/agents/register", {
      method: "POST",
      body: JSON.stringify({
        identityType: "API_KEY",
        externalId: `frontend-agent-${Date.now()}`,
        ownerRef,
        capabilities: ["luffa.create_task"]
      })
    });
    setAgentId(registered.agentId);
    await callApi("/v1/policies", {
      method: "POST",
      body: JSON.stringify({
        ownerRef,
        jsonRules: {
          allowedActions: ["luffa.create_task"],
          maxBudgetPerAction: 10,
          allowedAssets: [asset],
          allowedChains: [chainKeyForAsset(asset)]
        }
      })
    });
    return registered.agentId;
  }

  async function recordSettlement() {
    const settlement = await callApi<ExecutionRecord>("/v2/settlement/transfer", {
      method: "POST",
      body: JSON.stringify({
        executionId: execution.executionId ?? `exec_frontend_${Date.now()}`,
        payerDid: ownerRef,
        payeeDid: "did:luffa:payee",
        asset,
        amount: Number(amount),
        rail: railForAsset(asset),
        chainKey: chainKeyForAsset(asset),
        walletAddress: asset === "SOL" ? solanaWallet.publicKey?.toBase58() : address,
        toAddress: recipient,
        txHash: manualTxHash,
        idempotencyKey: `settlement-${manualTxHash || Date.now()}`
      })
    });
    setExecution((current) => ({ ...current, ...settlement }));
  }

  async function submitFeedback() {
    if (!execution.executionId || !agentId) return;
    const nextReputation = await callApi<Record<string, unknown>>(
      `/v1/executions/${execution.executionId}/feedback`,
      {
        method: "POST",
        body: JSON.stringify({ score: 5, comment: "Frontend demo settlement completed" })
      }
    );
    setReputation(nextReputation);
  }

  return (
    <main className="min-h-screen px-5 py-6 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-4">
        <header className="flex flex-col gap-4 border-b border-grid pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-luffa">Luffa Fabric MVP 2</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal md:text-5xl">
              Multi-chain wallet settlement console
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ConnectButton />
            <WalletMultiButton />
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="panel p-4">
            <h2 className="text-sm font-black uppercase text-ink">Wallet</h2>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-bold">
                Owner DID
                <input
                  className="rounded-md border border-grid px-3 py-2"
                  value={ownerRef}
                  onChange={(event) => setOwnerRef(event.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border border-grid p-3">
                  <span className="block text-xs font-black uppercase text-slate-500">EVM</span>
                  <strong className="mt-1 block break-all">{address ?? "Not connected"}</strong>
                </div>
                <div className="rounded-md border border-grid p-3">
                  <span className="block text-xs font-black uppercase text-slate-500">Solana</span>
                  <strong className="mt-1 block break-all">
                    {solanaWallet.publicKey?.toBase58() ?? "Not connected"}
                  </strong>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-md bg-ink px-3 py-2 text-sm font-black text-white disabled:opacity-40"
                  disabled={!isConnected}
                  onClick={bindEvmWallet}
                >
                  Bind EVM
                </button>
                <button
                  className="rounded-md bg-luffa px-3 py-2 text-sm font-black text-white disabled:opacity-40"
                  disabled={!solanaWallet.publicKey}
                  onClick={bindSolanaWallet}
                >
                  Bind Phantom
                </button>
              </div>
            </div>
          </div>

          <div className="panel p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-sm font-black uppercase text-ink">Chain and settlement</h2>
              <div className="flex flex-wrap gap-2">
                {[baseSepolia, sepolia, polygonAmoy].map((chain) => (
                  <button
                    key={chain.id}
                    className="rounded-md border border-grid px-3 py-2 text-sm font-black"
                    onClick={() => switchChain({ chainId: chain.id })}
                  >
                    {chain.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <label className="grid gap-1 text-sm font-bold">
                Asset
                <select
                  className="rounded-md border border-grid px-3 py-2"
                  value={asset}
                  onChange={(event) => setAsset(event.target.value)}
                >
                  <option>USDC</option>
                  <option>USDT</option>
                  <option>ETH</option>
                  <option>SOL</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold">
                Amount
                <input
                  className="rounded-md border border-grid px-3 py-2"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm font-bold md:col-span-2">
                Recipient
                <input
                  className="rounded-md border border-grid px-3 py-2"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="grid gap-1 text-sm font-bold">
                txHash
                <input
                  className="rounded-md border border-grid px-3 py-2"
                  value={manualTxHash}
                  onChange={(event) => setManualTxHash(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button
                  className="rounded-md bg-chain px-3 py-2 text-sm font-black text-white disabled:opacity-40"
                  disabled={asset === "SOL"}
                  onClick={sendNativeTx}
                >
                  Send native tx
                </button>
                <button className="rounded-md bg-ink px-3 py-2 text-sm font-black text-white" onClick={recordSettlement}>
                  Record settlement
                </button>
              </div>
            </div>

            <p className="mt-3 text-sm font-semibold text-slate-600">
              Active chain: {activeChain?.name ?? chainId}. Solana RPC: {connection.rpcEndpoint}
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="panel p-4">
            <h2 className="text-sm font-black uppercase text-ink">Agent flow</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-md bg-ink px-3 py-2 text-sm font-black text-white" onClick={registerAgentAndPolicy}>
                Register agent
              </button>
              <button className="rounded-md bg-luffa px-3 py-2 text-sm font-black text-white" onClick={invokeAgentAction}>
                Invoke action
              </button>
              <button
                className="rounded-md bg-alert px-3 py-2 text-sm font-black text-white disabled:opacity-40"
                disabled={!execution.executionId}
                onClick={submitFeedback}
              >
                Submit feedback
              </button>
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between gap-4 border-t border-grid pt-2">
                <dt className="font-black">Agent</dt>
                <dd className="break-all text-right">{agentId || "not registered"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-grid pt-2">
                <dt className="font-black">Execution</dt>
                <dd>{execution.status ?? "pending"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-grid pt-2">
                <dt className="font-black">Settlement</dt>
                <dd>{execution.settlementStatus ?? "pending"}</dd>
              </div>
            </dl>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <pre className="panel min-h-80 overflow-auto p-4 text-xs">
{JSON.stringify({ execution, reputation }, null, 2)}
            </pre>
            <pre className="panel min-h-80 overflow-auto p-4 text-xs">
{log.join("\n")}
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
