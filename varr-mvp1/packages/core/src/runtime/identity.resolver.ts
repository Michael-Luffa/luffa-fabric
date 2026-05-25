import type { AgentResource } from "../resources/agent.resource.ts";
import type { AgentRepository } from "../storage/repository.interface.ts";

export class IdentityResolver {
  private readonly agents: AgentRepository;

  constructor(agents: AgentRepository) {
    this.agents = agents;
  }

  async resolveActiveAgent(agentId: string): Promise<{ ok: true; agent: AgentResource } | { ok: false; reason: string }> {
    const agent = await this.agents.get(agentId);
    if (!agent) {
      return { ok: false, reason: "agent_not_found" };
    }
    if (agent.status !== "active") {
      return { ok: false, reason: `agent_${agent.status}` };
    }
    return { ok: true, agent };
  }
}
