import type { LaelDb } from "../db/index.js";
import { clamp, newId, nowIso, parseJson, stableJson } from "../utils.js";
import type { FeedbackRecord, Reputation, RLHFExportRecord } from "./types.js";

const EMA_ALPHA = 0.1;
const INITIAL_REPUTATION = 0.5;
const DEFAULT_SCHEMA_VERSION = "1.0";
const DEFAULT_API_VERSION = "v1";

interface ExecutionAgentRow {
  execution_id: string;
  agent_id: string;
}

interface ReputationRow {
  agent_id: string;
  score: number;
  feedback_count: number;
  dp_epsilon: number | null;
  updated_at: string;
  schema_version: string | null;
  api_version: string | null;
}

interface FeedbackRow {
  feedback_id: string;
  execution_id: string;
  agent_id: string;
  score: number;
  normalized_score: number;
  comment: string | null;
  applied: number;
  created_at: string;
  schema_version: string | null;
  api_version: string | null;
}

interface RLHFRow {
  execution_id: string;
  raw_input: string | null;
  action: string;
  params: string;
  result: string | null;
  normalized_score: number;
}

export class LearningService {
  constructor(private readonly database: LaelDb) {}

  submitFeedback(executionId: string, score: number, comment?: string): FeedbackRecord {
    const execution = this.database.db
      .prepare("SELECT execution_id, agent_id FROM execution_records WHERE execution_id = ?")
      .get(executionId) as ExecutionAgentRow | undefined;

    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const normalizedScore = clamp(score / 5);
    const feedback: FeedbackRecord = {
      feedbackId: newId("feedback"),
      executionId,
      agentId: execution.agent_id,
      score,
      normalizedScore,
      comment,
      applied: false,
      createdAt: nowIso(),
      schemaVersion: DEFAULT_SCHEMA_VERSION,
      apiVersion: DEFAULT_API_VERSION,
    };

    this.database.db
      .prepare(
        `
          INSERT INTO feedback_records (
            feedback_id, execution_id, agent_id, score, normalized_score,
            comment, applied, schema_version, api_version, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `,
      )
      .run(
        feedback.feedbackId,
        feedback.executionId,
        feedback.agentId,
        feedback.score,
        feedback.normalizedScore,
        feedback.comment ?? null,
        feedback.schemaVersion,
        feedback.apiVersion,
        feedback.createdAt,
      );

    this.updateReputation(execution.agent_id);
    this.database.db
      .prepare("UPDATE execution_records SET feedback = ? WHERE execution_id = ?")
      .run(
        stableJson({
          feedbackId: feedback.feedbackId,
          score: feedback.score,
          normalizedScore: feedback.normalizedScore,
          comment: feedback.comment,
          createdAt: feedback.createdAt,
        }),
        feedback.executionId,
      );
    return { ...feedback, applied: true };
  }

  updateReputation(agentId: string): Reputation {
    return this.database.transaction(() => {
      const current = this.ensureReputation(agentId);
      const feedbackRows = this.database.db
        .prepare(
          `
            SELECT * FROM feedback_records
            WHERE agent_id = ? AND applied = 0
            ORDER BY created_at ASC, feedback_id ASC
          `,
        )
        .all(agentId) as unknown as FeedbackRow[];

      let score = current.score;
      let feedbackCount = current.feedbackCount;
      for (const feedback of feedbackRows) {
        score = EMA_ALPHA * feedback.normalized_score + (1 - EMA_ALPHA) * score;
        feedbackCount += 1;
        this.database.db
          .prepare("UPDATE feedback_records SET applied = 1 WHERE feedback_id = ?")
          .run(feedback.feedback_id);
      }

      const updatedAt = nowIso();
      this.database.db
        .prepare(
          `
            UPDATE reputation
            SET score = ?, feedback_count = ?, schema_version = ?, api_version = ?, updated_at = ?
            WHERE agent_id = ?
          `,
        )
        .run(score, feedbackCount, DEFAULT_SCHEMA_VERSION, DEFAULT_API_VERSION, updatedAt, agentId);

      return {
        agentId,
        score,
        feedbackCount,
        dpEpsilon: current.dpEpsilon,
        updatedAt,
        schemaVersion: current.schemaVersion,
        apiVersion: current.apiVersion,
      };
    });
  }

  getReputation(agentId: string): Reputation {
    return this.ensureReputation(agentId);
  }

  exportRLHF(): RLHFExportRecord[] {
    const rows = this.database.db
      .prepare(
        `
          SELECT
            er.execution_id,
            er.raw_input,
            er.action,
            er.params,
            er.result,
            fr.normalized_score
          FROM feedback_records fr
          JOIN execution_records er ON er.execution_id = fr.execution_id
          ORDER BY fr.created_at ASC, fr.feedback_id ASC
        `,
      )
      .all() as unknown as RLHFRow[];

    return rows.map((row) => ({
      executionId: row.execution_id,
      rawInput: row.raw_input ?? undefined,
      action: row.action,
      params: parseJson<Record<string, unknown>>(row.params, {}),
      result: parseJson<Record<string, unknown>>(row.result, {}),
      rewardSignal: row.normalized_score,
    }));
  }

  private ensureReputation(agentId: string): Reputation {
    const existing = this.database.db
      .prepare("SELECT * FROM reputation WHERE agent_id = ?")
      .get(agentId) as ReputationRow | undefined;

    if (existing) {
      return mapReputationRow(existing);
    }

    const reputation: Reputation = {
      agentId,
      score: INITIAL_REPUTATION,
      feedbackCount: 0,
      dpEpsilon: undefined,
      updatedAt: nowIso(),
      schemaVersion: DEFAULT_SCHEMA_VERSION,
      apiVersion: DEFAULT_API_VERSION,
    };
    this.database.db
      .prepare(
        `
          INSERT INTO reputation (
            agent_id, score, feedback_count, dp_epsilon, schema_version,
            api_version, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        reputation.agentId,
        reputation.score,
        reputation.feedbackCount,
        reputation.dpEpsilon ?? null,
        reputation.schemaVersion,
        reputation.apiVersion,
        reputation.updatedAt,
      );

    return reputation;
  }
}

function mapReputationRow(row: ReputationRow): Reputation {
  return {
    agentId: row.agent_id,
    score: row.score,
    feedbackCount: row.feedback_count,
    dpEpsilon: row.dp_epsilon ?? undefined,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version ?? DEFAULT_SCHEMA_VERSION,
    apiVersion: row.api_version ?? DEFAULT_API_VERSION,
  };
}
