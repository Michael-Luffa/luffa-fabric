import { parseWith } from "../packages/core/src/schemas/index.ts";
import { validateAgentResource, type AgentResource } from "../packages/core/src/resources/agent.resource.ts";
import { validateCapabilityGrant, type CapabilityGrant } from "../packages/core/src/resources/capability.resource.ts";
import { validateContextResource, type ContextResource } from "../packages/core/src/resources/context.resource.ts";
import { validateWorkflowResource, type WorkflowResource } from "../packages/core/src/resources/workflow.resource.ts";
import { validateExecutionIntent, type ExecutionIntent } from "../packages/core/src/resources/execution-intent.resource.ts";
import { createMemoryRepositories } from "../packages/core/src/storage/memory.repository.ts";
import type { LaelRepositories } from "../packages/core/src/storage/repository.interface.ts";

export const ids = {
  agent: "did:luffa:agent:community-summary-001",
  owner: "did:luffa:user:owner001",
  context: "ctx_community_123_public",
  workflow: "wf_community_summary_001",
  resource: "luffa://community/123/channel/public"
};

export function agent(overrides: Partial<AgentResource> = {}): AgentResource {
  return parseWith("AgentResource", {
    kind: "AgentResource",
    version: "1.0",
    agent_id: ids.agent,
    owner_did: ids.owner,
    name: "Community Summary Agent",
    description: "Summarizes public community channel messages.",
    runtime_adapter: "mock",
    behavior_profile: { role: "community_operator", tone: "professional", risk_tolerance: "low" },
    capability_bindings: [],
    context_bindings: [],
    status: "active",
    created_at: "2026-05-25T00:00:00Z",
    updated_at: "2026-05-25T00:00:00Z",
    ...overrides
  }, validateAgentResource);
}

export function capability(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return parseWith("CapabilityGrant", {
    kind: "CapabilityGrant",
    version: "1.0",
    capability_id: "cap_community_read_001",
    issuer: ids.owner,
    subject: ids.agent,
    resource: ids.resource,
    actions: ["read", "summarize", "draft_post", "generate_receipt"],
    constraints: {
      expires_at: "2099-01-01T00:00:00Z",
      max_calls_per_day: 100,
      max_spend_usd: 0,
      no_private_messages: true,
      requires_approval_for: ["publish", "external_share"]
    },
    delegation: {
      can_delegate: false,
      max_delegation_depth: 0,
      allowed_delegatees: []
    },
    revocation: {
      revocable: true,
      cascade_revoke: true
    },
    status: "active",
    created_at: "2026-05-25T00:00:00Z",
    ...overrides
  }, validateCapabilityGrant);
}

export function context(overrides: Partial<ContextResource> = {}): ContextResource {
  return parseWith("ContextResource", {
    kind: "ContextResource",
    version: "1.0",
    context_id: ids.context,
    namespace: "community:123",
    owner: "did:luffa:community:123",
    scope: "community_public",
    allowed_subjects: [ids.agent],
    retrieval_policy: "public_only",
    memory_type: "short_term",
    consent_required: false,
    cross_namespace_access: false,
    data_sources: [{ type: "mock_channel", ref: "community/123/channel/public" }],
    status: "active",
    ...overrides
  }, validateContextResource);
}

export function workflow(overrides: Partial<WorkflowResource> = {}): WorkflowResource {
  return parseWith("WorkflowResource", {
    kind: "WorkflowResource",
    version: "1.0",
    workflow_id: ids.workflow,
    name: "Community Public Channel Summary",
    owner: ids.owner,
    allowed_agents: [ids.agent],
    steps: [
      { id: "resolve_context", action: "read", resource: ids.resource },
      { id: "summarize", action: "summarize", skill: "builtin.summarize" },
      { id: "draft", action: "draft_post" },
      { id: "receipt", action: "generate_receipt" }
    ],
    risk_profile: "low",
    status: "active",
    ...overrides
  }, validateWorkflowResource);
}

export function intent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
  return parseWith("ExecutionIntent", {
    kind: "ExecutionIntent",
    intent_id: "intent_001",
    agent_id: ids.agent,
    workflow_id: ids.workflow,
    requested_by: ids.owner,
    context_refs: [ids.context],
    input: { task: "Summarize the latest public channel messages." },
    requested_actions: ["read", "summarize", "draft_post", "generate_receipt"],
    created_at: "2026-05-25T00:00:00Z",
    ...overrides
  }, validateExecutionIntent);
}

export async function seededRepositories(options: { includeCapability?: boolean; capabilityOverride?: Partial<CapabilityGrant>; workflowOverride?: Partial<WorkflowResource>; contextOverride?: Partial<ContextResource>; agentOverride?: Partial<AgentResource> } = {}): Promise<LaelRepositories> {
  const repositories = createMemoryRepositories();
  await repositories.agents.create(agent(options.agentOverride));
  await repositories.contexts.create(context(options.contextOverride));
  await repositories.workflows.create(workflow(options.workflowOverride));
  if (options.includeCapability ?? true) {
    await repositories.capabilities.create(capability(options.capabilityOverride));
  }
  return repositories;
}
