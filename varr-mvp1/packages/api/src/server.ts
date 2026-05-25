import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createMemoryRepositories } from "../../core/src/storage/memory.repository.ts";
import type { LaelRepositories } from "../../core/src/storage/repository.interface.ts";
import { createOpenApiSpec } from "./openapi.ts";
import { handleAgentRoute } from "./routes/agents.ts";
import { handleCapabilityRoute } from "./routes/capabilities.ts";
import { handleContextRoute } from "./routes/contexts.ts";
import { handleWorkflowRoute } from "./routes/workflows.ts";
import { handleExecutionRoute } from "./routes/executions.ts";
import { handleFeedbackRoute } from "./routes/feedback.ts";
import { handleLearningRoute } from "./routes/learning.ts";

export function createApiServer(repositories: LaelRepositories = createMemoryRepositories()) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      const body = await readJsonBody(request);
      const result = await dispatch(request.method ?? "GET", parts, body, url, repositories);

      if (result === undefined) {
        writeJson(response, 404, { error: "not_found" });
        return;
      }

      writeJson(response, 200, result);
    } catch (error) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : "bad_request"
      });
    }
  });
}

async function dispatch(method: string, parts: string[], body: unknown, url: URL, repositories: LaelRepositories): Promise<unknown | undefined> {
  if (method === "GET" && parts.length === 1 && parts[0] === "openapi.json") {
    return createOpenApiSpec();
  }
  if (parts[0] !== "v1") {
    return undefined;
  }

  const resource = parts[1];
  if (resource === "agents") {
    return handleAgentRoute(method, parts.slice(1), body, repositories);
  }
  if (resource === "capabilities") {
    return handleCapabilityRoute(method, parts.slice(1), body, repositories);
  }
  if (resource === "contexts") {
    return handleContextRoute(method, parts.slice(1), body, repositories);
  }
  if (resource === "workflows") {
    return handleWorkflowRoute(method, parts.slice(1), body, repositories);
  }
  if (resource === "execution") {
    return handleExecutionRoute(method, parts.slice(1), body, repositories);
  }
  if (resource === "feedback") {
    return handleFeedbackRoute(method, parts.slice(1), body, repositories);
  }
  if (resource === "learning") {
    return handleLearningRoute(method, parts.slice(1), url.searchParams.get("receipt_id"), repositories);
  }
  return undefined;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === "GET") {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : undefined;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  createApiServer().listen(port, () => {
    console.log(`LAEL MVP1 API listening on http://localhost:${port}`);
  });
}
