export interface Reputation {
  agentId: string;
  score: number;
  feedbackCount: number;
  dpEpsilon?: number;
  updatedAt: string;
  schemaVersion: string;
  apiVersion: string;
}

export interface FeedbackRecord {
  feedbackId: string;
  executionId: string;
  agentId: string;
  score: number;
  normalizedScore: number;
  comment?: string;
  applied: boolean;
  createdAt: string;
  schemaVersion: string;
  apiVersion: string;
}

export interface RLHFExportRecord {
  executionId: string;
  rawInput?: string;
  action: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  rewardSignal: number;
}
