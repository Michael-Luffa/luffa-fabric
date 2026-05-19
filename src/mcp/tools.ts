import type { LAEL } from "../core/index.js";
import type { ExecutionRequest } from "../execution/types.js";
import type { RegisterAgentInput } from "../identity/types.js";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function createMcpTools(lael: LAEL) {
  const tools: McpTool[] = [
    {
      name: "lael.register_agent",
      description: "Register an external agent and return its LAEL identity.",
      inputSchema: {
        type: "object",
        properties: {
          identityType: { type: "string" },
          externalId: { type: "string" },
          ownerRef: { type: "string" },
          capabilities: { type: "array", items: { type: "string" } },
        },
        required: ["identityType", "externalId", "ownerRef"],
      },
    },
    {
      name: "lael.invoke",
      description: "Invoke an action through the LAEL identity-permission-execution pipeline.",
      inputSchema: executionSchema(),
    },
    {
      name: "lael.get_execution",
      description: "Get an execution record by ID.",
      inputSchema: {
        type: "object",
        properties: { executionId: { type: "string" } },
        required: ["executionId"],
      },
    },
    {
      name: "lael.submit_feedback",
      description: "Submit execution feedback and update EMA reputation.",
      inputSchema: {
        type: "object",
        properties: {
          executionId: { type: "string" },
          score: { type: "number" },
          comment: { type: "string" },
        },
        required: ["executionId", "score"],
      },
    },
    fixedActionTool("luffa.send_message"),
    fixedActionTool("luffa.create_task"),
    fixedActionTool("luffa.reward_user"),
    fixedActionTool("luffa.query_wallet"),
    fixedActionTool("luffa.trigger_payment"),
  ];

  async function callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    try {
      switch (name) {
        case "lael.register_agent": {
          const agent = await lael.registerAgent(args as unknown as RegisterAgentInput);
          return textResult({
            agentId: agent.internalId,
            status: agent.status,
            capabilities: agent.capabilities,
            publicKey: agent.publicKey,
            profile: agent,
          });
        }
        case "lael.invoke": {
          return textResult(await lael.invoke(args as unknown as ExecutionRequest));
        }
        case "lael.get_execution": {
          const executionId = String(args.executionId);
          const record = lael.getExecutionRecord(executionId);
          return textResult(record ?? { error: "Execution not found" }, !record);
        }
        case "lael.submit_feedback": {
          return textResult(
            lael.submitFeedback(
              String(args.executionId),
              Number(args.score),
              typeof args.comment === "string" ? args.comment : undefined,
            ),
          );
        }
        default:
          if (name.startsWith("luffa.")) {
            const params = objectLike(args.params) ?? {};
            return textResult(
              await lael.invoke({
                ...(args as unknown as Omit<ExecutionRequest, "action" | "params">),
                action: name,
                params,
              }),
            );
          }
          return textResult({ error: `Unknown tool: ${name}` }, true);
      }
    } catch (error) {
      return textResult(
        { error: error instanceof Error ? error.message : "Tool call failed" },
        true,
      );
    }
  }

  return { tools, callTool };
}

function executionSchema(): McpTool["inputSchema"] {
  return {
    type: "object",
    properties: {
      agentId: { type: "string" },
      targetDid: { type: "string" },
      action: { type: "string" },
      params: { type: "object" },
      rawInput: { type: "string" },
      idempotencyKey: { type: "string" },
      capabilityTokenId: { type: "string" },
      context: { type: "object" },
      requireExecutionProof: { type: "boolean" },
      proofType: { type: "string", enum: ["zkml", "tee_attestation", "multi_verification"] },
    },
    required: ["agentId", "action", "params", "idempotencyKey"],
  };
}

function fixedActionTool(action: string): McpTool {
  return {
    name: action,
    description: `Invoke ${action} through LAEL.`,
    inputSchema: {
      ...executionSchema(),
      required: ["agentId", "params", "idempotencyKey"],
    },
  };
}

function textResult(value: unknown, isError = false): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    isError: isError || undefined,
  };
}

function objectLike(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}
