import type { ExecutionAdapter, AdapterExecutionResult } from "../adapters/execution.adapter.ts";
import { MockExecutionAdapter } from "../adapters/mock.execution.adapter.ts";
import { OpenClawStubAdapter } from "../adapters/openclaw.stub.adapter.ts";
import { LuffaStubAdapter } from "../adapters/luffa.stub.adapter.ts";
import type { ContextResource } from "../resources/context.resource.ts";
import type { ExecutionIntent } from "../resources/execution-intent.resource.ts";
import { validateExecutionIntent } from "../resources/execution-intent.resource.ts";
import type { WorkflowResource } from "../resources/workflow.resource.ts";
import { workflowActions } from "../resources/workflow.resource.ts";
import type { ExecutionReceipt, ExecutionStatus } from "../evidence/execution.receipt.ts";
import type { LaelRepositories } from "../storage/repository.interface.ts";
import { parseWith } from "../schemas/index.ts";
import type { PolicyDecision, RiskLevel } from "../security/risk.levels.ts";
import { IdentityResolver } from "./identity.resolver.ts";
import { CapabilityChecker } from "./capability.checker.ts";
import { ContextBoundaryChecker } from "./context.boundary.checker.ts";
import { RiskClassifier, type RiskClassification } from "./risk.classifier.ts";
import { ApprovalGate } from "./approval.gate.ts";
import { ExecutionRunner } from "./execution.runner.ts";
import { ReceiptGenerator } from "./receipt.generator.ts";

export type RuntimeResult = {
  receipt: ExecutionReceipt;
  output?: AdapterExecutionResult;
};

export type RuntimeOrchestratorOptions = {
  repositories: LaelRepositories;
  adapters?: ExecutionAdapter[];
};

export class RuntimeOrchestrator {
  private readonly repositories: LaelRepositories;
  private readonly adapters = new Map<string, ExecutionAdapter>();
  private readonly identityResolver: IdentityResolver;
  private readonly capabilityChecker: CapabilityChecker;
  private readonly contextBoundaryChecker: ContextBoundaryChecker;
  private readonly riskClassifier = new RiskClassifier();
  private readonly approvalGate = new ApprovalGate();
  private readonly executionRunner = new ExecutionRunner();
  private readonly receiptGenerator: ReceiptGenerator;

  constructor(options: RuntimeOrchestratorOptions) {
    this.repositories = options.repositories;
    for (const adapter of [new MockExecutionAdapter(), new OpenClawStubAdapter(), new LuffaStubAdapter(), ...(options.adapters ?? [])]) {
      this.adapters.set(adapter.name, adapter);
    }
    this.identityResolver = new IdentityResolver(options.repositories.agents);
    this.capabilityChecker = new CapabilityChecker(options.repositories.capabilities);
    this.contextBoundaryChecker = new ContextBoundaryChecker(options.repositories.contexts);
    this.receiptGenerator = new ReceiptGenerator(options.repositories.receipts);
  }

  async run(input: unknown): Promise<RuntimeResult> {
    const intent = parseWith("ExecutionIntent", input, validateExecutionIntent);
    const decisions: PolicyDecision[] = [];
    let contexts: ContextResource[] = [];
    let capabilityIds: string[] = [];
    let risk = lowRisk();

    const workflow = await this.repositories.workflows.get(intent.workflow_id);
    if (!workflow || workflow.status !== "active") {
      return { receipt: await this.finish(intent, "rejected", `Workflow unavailable: ${intent.workflow_id}`, capabilityIds, contexts, decisions, risk) };
    }

    const identity = await this.identityResolver.resolveActiveAgent(intent.agent_id);
    if (!identity.ok) {
      decisions.push({ action: "resolve_agent", decision: "deny", reason: identity.reason });
      return { receipt: await this.finish(intent, "denied", `Agent cannot execute: ${identity.reason}`, capabilityIds, contexts, decisions, risk) };
    }

    if (!workflow.allowed_agents.includes(intent.agent_id)) {
      decisions.push({ action: "load_workflow", decision: "deny", reason: "agent_not_allowed_for_workflow" });
      return { receipt: await this.finish(intent, "denied", "Agent is not allowed for workflow", capabilityIds, contexts, decisions, risk) };
    }

    const actions = unique([...intent.requested_actions, ...workflowActions(workflow)]);
    const riskClassification = this.riskClassifier.classify(actions);
    risk = {
      level: riskClassification.level,
      approval_required: riskClassification.level === "high"
    };
    decisions.push(...riskClassification.decisions);

    if (riskClassification.level === "critical") {
      return {
        receipt: await this.finish(intent, "denied", "Critical action denied before adapter execution", capabilityIds, contexts, decisions, risk)
      };
    }

    const boundary = await this.contextBoundaryChecker.check(identity.agent, workflow, intent.context_refs);
    contexts = boundary.contexts;
    decisions.push(...boundary.decisions);
    if (!boundary.ok) {
      return { receipt: await this.finish(intent, "denied", `Context boundary violation: ${boundary.reason}`, capabilityIds, contexts, decisions, risk) };
    }

    const capabilities = await this.capabilityChecker.check(identity.agent, workflow, intent.requested_actions);
    capabilityIds = capabilities.capability_ids;
    decisions.push(...capabilities.decisions);
    if (!capabilities.ok) {
      return { receipt: await this.finish(intent, "denied", `Capability denied: ${capabilities.reason}`, capabilityIds, contexts, decisions, risk) };
    }

    const approval = this.approvalGate.evaluate(actions, riskClassification, capabilities.capabilities);
    if (approval.decision === "pending_approval") {
      risk = { ...risk, approval_required: true };
      decisions.push({ action: "approval_gate", decision: "pending_approval", reason: approval.reason });
      return { receipt: await this.finish(intent, "pending_approval", `Approval required: ${approval.reason}`, capabilityIds, contexts, decisions, risk) };
    }

    const adapter = this.adapters.get(identity.agent.runtime_adapter);
    if (!adapter) {
      decisions.push({ action: "select_adapter", decision: "deny", reason: "adapter_not_available" });
      return { receipt: await this.finish(intent, "failed", `Adapter unavailable: ${identity.agent.runtime_adapter}`, capabilityIds, contexts, decisions, risk) };
    }

    try {
      const output = await this.executionRunner.run(adapter, {
        intent,
        workflow,
        contexts,
        actions
      });
      const receipt = await this.finish(intent, "success", output.summary, capabilityIds, contexts, decisions, risk, output, output.compute_units);
      return { receipt, output };
    } catch (error) {
      const message = error instanceof Error ? error.message : "adapter_error";
      decisions.push({ action: "execute_adapter", decision: "deny", reason: message });
      return { receipt: await this.finish(intent, "failed", `Adapter error: ${message}`, capabilityIds, contexts, decisions, risk) };
    }
  }

  private async finish(
    intent: ExecutionIntent,
    status: ExecutionStatus,
    summary: string,
    capability_ids: string[],
    contexts: ContextResource[],
    policy_decisions: PolicyDecision[],
    risk: { level: RiskLevel; approval_required: boolean },
    output?: unknown,
    compute_units = 0
  ): Promise<ExecutionReceipt> {
    return this.receiptGenerator.generate({
      intent,
      capability_ids,
      contexts,
      policy_decisions,
      risk,
      status,
      summary,
      output,
      compute_units
    });
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function lowRisk(): { level: RiskLevel; approval_required: boolean } {
  return { level: "low", approval_required: false };
}
