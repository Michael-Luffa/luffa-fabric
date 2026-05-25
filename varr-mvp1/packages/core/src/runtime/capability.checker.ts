import type { CapabilityGrant } from "../resources/capability.resource.ts";
import type { AgentResource } from "../resources/agent.resource.ts";
import type { WorkflowResource } from "../resources/workflow.resource.ts";
import type { CapabilityRepository } from "../storage/repository.interface.ts";
import type { PolicyDecision } from "../security/risk.levels.ts";

export type CapabilityCheckResult =
  | { ok: true; capabilities: CapabilityGrant[]; capability_ids: string[]; decisions: PolicyDecision[] }
  | { ok: false; reason: string; capabilities: CapabilityGrant[]; capability_ids: string[]; decisions: PolicyDecision[] };

export class CapabilityChecker {
  private readonly capabilities: CapabilityRepository;

  constructor(capabilities: CapabilityRepository) {
    this.capabilities = capabilities;
  }

  async check(agent: AgentResource, workflow: WorkflowResource, requestedActions: string[]): Promise<CapabilityCheckResult> {
    const grants = await this.capabilities.findActiveBySubject(agent.agent_id);
    const actions = [...new Set([...requestedActions, ...workflow.steps.map((step) => step.action)])];
    const decisions: PolicyDecision[] = [];
    const matched = new Set<string>();

    for (const action of actions) {
      const workflowResources = workflow.steps.filter((step) => step.action === action).flatMap((step) => (step.resource ? [step.resource] : []));
      const coveringGrant = grants.find((grant) => {
        if (!grant.actions.includes(action)) {
          return false;
        }
        if (workflowResources.length === 0) {
          return true;
        }
        return workflowResources.every((resource) => resource === grant.resource);
      });

      if (!coveringGrant) {
        decisions.push({ action, decision: "deny", reason: "capability_missing_or_inactive" });
        return {
          ok: false,
          reason: `capability_missing:${action}`,
          capabilities: grants,
          capability_ids: [...matched],
          decisions
        };
      }

      matched.add(coveringGrant.capability_id);
      decisions.push({ action, decision: "allow", reason: "capability_valid" });
    }

    return {
      ok: true,
      capabilities: grants.filter((grant) => matched.has(grant.capability_id)),
      capability_ids: [...matched],
      decisions
    };
  }
}
