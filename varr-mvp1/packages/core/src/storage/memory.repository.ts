import { cloneJson } from "../schemas/index.ts";
import type { AgentResource, AgentPatch } from "../resources/agent.resource.ts";
import type { CapabilityGrant } from "../resources/capability.resource.ts";
import type { ContextResource } from "../resources/context.resource.ts";
import type { WorkflowResource } from "../resources/workflow.resource.ts";
import type { ExecutionReceipt } from "../evidence/execution.receipt.ts";
import type { FeedbackResource } from "../resources/feedback.resource.ts";
import type { LearningSignal } from "../resources/learning-signal.resource.ts";
import type {
  AgentRepository,
  CapabilityRepository,
  ContextRepository,
  FeedbackRepository,
  LaelRepositories,
  LearningSignalRepository,
  ReceiptRepository,
  RepositorySnapshot,
  WorkflowRepository
} from "./repository.interface.ts";

class MemoryRepository<T> {
  protected readonly records = new Map<string, T>();
  private readonly idOf: (entity: T) => string;
  private readonly name: string;

  constructor(name: string, idOf: (entity: T) => string, seed: T[] = []) {
    this.name = name;
    this.idOf = idOf;
    for (const entity of seed) {
      this.records.set(idOf(entity), cloneJson(entity));
    }
  }

  async create(entity: T): Promise<T> {
    const id = this.idOf(entity);
    if (this.records.has(id)) {
      throw new Error(`${this.name} already exists: ${id}`);
    }
    this.records.set(id, cloneJson(entity));
    return cloneJson(entity);
  }

  async get(id: string): Promise<T | undefined> {
    const entity = this.records.get(id);
    return entity ? cloneJson(entity) : undefined;
  }

  async list(): Promise<T[]> {
    return [...this.records.values()].map(cloneJson);
  }

  protected async replace(id: string, entity: T): Promise<T> {
    if (!this.records.has(id)) {
      throw new Error(`${this.name} not found: ${id}`);
    }
    this.records.set(id, cloneJson(entity));
    return cloneJson(entity);
  }
}

class MemoryAgentRepository extends MemoryRepository<AgentResource> implements AgentRepository {
  constructor(seed: AgentResource[] = []) {
    super("AgentResource", (agent) => agent.agent_id, seed);
  }

  async update(id: string, patch: AgentPatch): Promise<AgentResource> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`AgentResource not found: ${id}`);
    }
    return this.replace(id, { ...existing, ...patch, updated_at: new Date().toISOString() });
  }

  async suspend(agentId: string): Promise<AgentResource> {
    return this.update(agentId, { status: "suspended" });
  }
}

class MemoryCapabilityRepository extends MemoryRepository<CapabilityGrant> implements CapabilityRepository {
  constructor(seed: CapabilityGrant[] = []) {
    super("CapabilityGrant", (capability) => capability.capability_id, seed);
  }

  async update(id: string, patch: Partial<CapabilityGrant>): Promise<CapabilityGrant> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`CapabilityGrant not found: ${id}`);
    }
    return this.replace(id, { ...existing, ...patch });
  }

  async findActiveBySubject(subject: string): Promise<CapabilityGrant[]> {
    const all = await this.list();
    const now = Date.now();
    return all.filter((capability) => {
      if (capability.subject !== subject || capability.status !== "active") {
        return false;
      }
      const expiresAt = capability.constraints.expires_at;
      return !expiresAt || Date.parse(expiresAt) > now;
    });
  }

  async revoke(capabilityId: string): Promise<CapabilityGrant> {
    return this.update(capabilityId, { status: "revoked" });
  }
}

class MemoryContextRepository extends MemoryRepository<ContextResource> implements ContextRepository {
  constructor(seed: ContextResource[] = []) {
    super("ContextResource", (context) => context.context_id, seed);
  }
}

class MemoryWorkflowRepository extends MemoryRepository<WorkflowResource> implements WorkflowRepository {
  constructor(seed: WorkflowResource[] = []) {
    super("WorkflowResource", (workflow) => workflow.workflow_id, seed);
  }
}

class MemoryReceiptRepository extends MemoryRepository<ExecutionReceipt> implements ReceiptRepository {
  constructor(seed: ExecutionReceipt[] = []) {
    super("ExecutionReceipt", (receipt) => receipt.receipt_id, seed);
  }
}

class MemoryFeedbackRepository extends MemoryRepository<FeedbackResource> implements FeedbackRepository {
  constructor(seed: FeedbackResource[] = []) {
    super("FeedbackResource", (feedback) => feedback.feedback_id, seed);
  }

  async listByReceipt(receiptId: string): Promise<FeedbackResource[]> {
    return (await this.list()).filter((feedback) => feedback.receipt_id === receiptId);
  }
}

class MemoryLearningSignalRepository extends MemoryRepository<LearningSignal> implements LearningSignalRepository {
  constructor(seed: LearningSignal[] = []) {
    super("LearningSignal", (signal) => signal.signal_id, seed);
  }

  async listByReceipt(receiptId: string): Promise<LearningSignal[]> {
    return (await this.list()).filter((signal) => signal.receipt_id === receiptId);
  }
}

export function createEmptySnapshot(): RepositorySnapshot {
  return {
    agents: [],
    capabilities: [],
    contexts: [],
    workflows: [],
    receipts: [],
    feedback: [],
    learningSignals: []
  };
}

export function createMemoryRepositories(snapshot: Partial<RepositorySnapshot> = {}): LaelRepositories {
  return {
    agents: new MemoryAgentRepository(snapshot.agents ?? []),
    capabilities: new MemoryCapabilityRepository(snapshot.capabilities ?? []),
    contexts: new MemoryContextRepository(snapshot.contexts ?? []),
    workflows: new MemoryWorkflowRepository(snapshot.workflows ?? []),
    receipts: new MemoryReceiptRepository(snapshot.receipts ?? []),
    feedback: new MemoryFeedbackRepository(snapshot.feedback ?? []),
    learningSignals: new MemoryLearningSignalRepository(snapshot.learningSignals ?? [])
  };
}

export async function snapshotRepositories(repositories: LaelRepositories): Promise<RepositorySnapshot> {
  return {
    agents: await repositories.agents.list(),
    capabilities: await repositories.capabilities.list(),
    contexts: await repositories.contexts.list(),
    workflows: await repositories.workflows.list(),
    receipts: await repositories.receipts.list(),
    feedback: await repositories.feedback.list(),
    learningSignals: await repositories.learningSignals.list()
  };
}
