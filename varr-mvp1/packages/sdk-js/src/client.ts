import type { JsonResource } from "./resources.ts";
import type { ExecutionRunResponse } from "./execution.ts";

export class LaelClient {
  private readonly baseUrl: string;

  constructor(baseUrl = "http://localhost:8787") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async createAgent(agent: JsonResource): Promise<JsonResource> {
    return this.post("/v1/agents", agent);
  }

  async createCapability(capability: JsonResource): Promise<JsonResource> {
    return this.post("/v1/capabilities", capability);
  }

  async createContext(context: JsonResource): Promise<JsonResource> {
    return this.post("/v1/contexts", context);
  }

  async createWorkflow(workflow: JsonResource): Promise<JsonResource> {
    return this.post("/v1/workflows", workflow);
  }

  async run(intent: JsonResource): Promise<ExecutionRunResponse> {
    return this.post("/v1/execution/run", intent);
  }

  async submitFeedback(feedback: JsonResource): Promise<Record<string, unknown>> {
    return this.post("/v1/feedback", feedback);
  }

  async learningSignals(receiptId: string): Promise<Record<string, unknown>[]> {
    return this.get(`/v1/learning/signals?receipt_id=${encodeURIComponent(receiptId)}`);
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    return readResponse<T>(response);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return readResponse<T>(response);
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(payload));
  }
  return payload as T;
}
