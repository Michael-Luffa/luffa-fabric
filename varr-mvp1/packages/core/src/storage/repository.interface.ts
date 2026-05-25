import type { AgentResource, AgentPatch } from "../resources/agent.resource.ts";
import type { CapabilityGrant } from "../resources/capability.resource.ts";
import type { ContextResource } from "../resources/context.resource.ts";
import type { WorkflowResource } from "../resources/workflow.resource.ts";
import type { ExecutionReceipt } from "../evidence/execution.receipt.ts";
import type { FeedbackResource } from "../resources/feedback.resource.ts";
import type { LearningSignal } from "../resources/learning-signal.resource.ts";

export interface Repository<T> {
  create(entity: T): Promise<T>;
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
}

export interface MutableRepository<T, Patch = Partial<T>> extends Repository<T> {
  update(id: string, patch: Patch): Promise<T>;
}

export interface AgentRepository extends MutableRepository<AgentResource, AgentPatch> {
  suspend(agentId: string): Promise<AgentResource>;
}

export interface CapabilityRepository extends MutableRepository<CapabilityGrant> {
  findActiveBySubject(subject: string): Promise<CapabilityGrant[]>;
  revoke(capabilityId: string): Promise<CapabilityGrant>;
}

export interface ContextRepository extends Repository<ContextResource> {}

export interface WorkflowRepository extends Repository<WorkflowResource> {}

export interface ReceiptRepository extends Repository<ExecutionReceipt> {}

export interface FeedbackRepository extends Repository<FeedbackResource> {
  listByReceipt(receiptId: string): Promise<FeedbackResource[]>;
}

export interface LearningSignalRepository extends Repository<LearningSignal> {
  listByReceipt(receiptId: string): Promise<LearningSignal[]>;
}

export type LaelRepositories = {
  agents: AgentRepository;
  capabilities: CapabilityRepository;
  contexts: ContextRepository;
  workflows: WorkflowRepository;
  receipts: ReceiptRepository;
  feedback: FeedbackRepository;
  learningSignals: LearningSignalRepository;
};

export type RepositorySnapshot = {
  agents: AgentResource[];
  capabilities: CapabilityGrant[];
  contexts: ContextResource[];
  workflows: WorkflowResource[];
  receipts: ExecutionReceipt[];
  feedback: FeedbackResource[];
  learningSignals: LearningSignal[];
};
