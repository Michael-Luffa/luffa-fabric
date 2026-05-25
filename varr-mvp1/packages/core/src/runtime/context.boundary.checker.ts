import type { AgentResource } from "../resources/agent.resource.ts";
import type { ContextResource } from "../resources/context.resource.ts";
import type { WorkflowResource } from "../resources/workflow.resource.ts";
import type { ContextRepository } from "../storage/repository.interface.ts";
import type { PolicyDecision } from "../security/risk.levels.ts";

export type ContextBoundaryResult =
  | { ok: true; contexts: ContextResource[]; namespace: string; decisions: PolicyDecision[] }
  | { ok: false; reason: string; contexts: ContextResource[]; decisions: PolicyDecision[] };

export class ContextBoundaryChecker {
  private readonly contexts: ContextRepository;

  constructor(contexts: ContextRepository) {
    this.contexts = contexts;
  }

  async check(agent: AgentResource, workflow: WorkflowResource, contextRefs: string[]): Promise<ContextBoundaryResult> {
    const decisions: PolicyDecision[] = [];
    const contexts: ContextResource[] = [];

    for (const contextRef of contextRefs) {
      const context = await this.contexts.get(contextRef);
      if (!context) {
        decisions.push({ action: "resolve_context", decision: "deny", reason: `context_not_found:${contextRef}` });
        return { ok: false, reason: `context_not_found:${contextRef}`, contexts, decisions };
      }
      contexts.push(context);
    }

    for (const context of contexts) {
      if (context.status !== "active") {
        decisions.push({ action: "resolve_context", decision: "deny", reason: `context_${context.status}` });
        return { ok: false, reason: `context_${context.status}`, contexts, decisions };
      }
      if (context.scope !== "community_public") {
        decisions.push({ action: "resolve_context", decision: "deny", reason: "private_context_denied_in_mvp1" });
        return { ok: false, reason: "private_context_denied_in_mvp1", contexts, decisions };
      }
      if (context.cross_namespace_access) {
        decisions.push({ action: "resolve_context", decision: "deny", reason: "cross_namespace_access_forbidden" });
        return { ok: false, reason: "cross_namespace_access_forbidden", contexts, decisions };
      }
      if (!context.allowed_subjects.includes(agent.agent_id)) {
        decisions.push({ action: "resolve_context", decision: "deny", reason: "agent_not_allowed_for_context" });
        return { ok: false, reason: "agent_not_allowed_for_context", contexts, decisions };
      }
      decisions.push({ action: "resolve_context", decision: "allow", reason: "context_active_and_subject_allowed" });
    }

    const namespaces = new Set(contexts.map((context) => context.namespace));
    if (namespaces.size !== 1) {
      decisions.push({ action: "resolve_context", decision: "deny", reason: "multiple_context_namespaces" });
      return { ok: false, reason: "multiple_context_namespaces", contexts, decisions };
    }

    const namespace = contexts[0]?.namespace ?? "";
    for (const step of workflow.steps) {
      if (!step.resource) {
        continue;
      }
      const resourceNamespace = namespaceFromResource(step.resource);
      if (resourceNamespace && resourceNamespace !== namespace) {
        decisions.push({ action: step.action, decision: "deny", reason: `resource_namespace_violation:${resourceNamespace}` });
        return { ok: false, reason: `resource_namespace_violation:${resourceNamespace}`, contexts, decisions };
      }
    }

    return { ok: true, contexts, namespace, decisions };
  }
}

export function namespaceFromResource(resource: string): string | undefined {
  const luffaMatch = resource.match(/^luffa:\/\/community\/([^/]+)/);
  if (luffaMatch) {
    return `community:${luffaMatch[1]}`;
  }
  const refMatch = resource.match(/^community\/([^/]+)/);
  if (refMatch) {
    return `community:${refMatch[1]}`;
  }
  return undefined;
}
