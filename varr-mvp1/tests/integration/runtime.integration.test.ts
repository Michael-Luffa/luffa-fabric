import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeOrchestrator } from "../../packages/core/src/runtime/runtime.orchestrator.ts";
import { FeedbackProcessor } from "../../packages/core/src/runtime/feedback.processor.ts";
import { LearningSignalEmitter } from "../../packages/core/src/runtime/learning.signal.emitter.ts";
import { seededRepositories, capability, intent } from "../helpers.ts";

test("happy path runs end to end with receipt, feedback, and learning signal", async () => {
  const repositories = await seededRepositories();
  const execution = await new RuntimeOrchestrator({ repositories }).run(intent());
  assert.equal(execution.receipt.status, "success");
  assert.equal(execution.receipt.receipt_id, "receipt_001");
  assert.equal((await repositories.receipts.list()).length, 1);

  const feedback = await new FeedbackProcessor(
    repositories.feedback,
    repositories.receipts,
    new LearningSignalEmitter(repositories.learningSignals, repositories.contexts)
  ).submit({
    kind: "FeedbackResource",
    version: "1.0",
    feedback_id: "fb_001",
    receipt_id: execution.receipt.receipt_id,
    source: "user",
    source_did: "did:luffa:user:owner001",
    label: "accepted",
    score: 5,
    comment: "Useful summary.",
    verified: true,
    weight: 1,
    created_at: "2026-05-25T00:00:00Z"
  });

  assert.equal(feedback.ok, true);
  assert.equal(feedback.ok ? feedback.learning_signal.receipt_id : "", execution.receipt.receipt_id);
});

test("high-risk action returns pending_approval and does not execute", async () => {
  const highRiskWorkflow = {
    steps: [
      { id: "resolve_context", action: "read", resource: "luffa://community/123/channel/public" },
      { id: "publish", action: "publish" }
    ],
    risk_profile: "high" as const
  };
  const repositories = await seededRepositories({
    includeCapability: false,
    workflowOverride: highRiskWorkflow
  });
  await repositories.capabilities.create(capability({ actions: ["read", "publish"] }));
  const execution = await new RuntimeOrchestrator({ repositories }).run(intent({ requested_actions: ["read", "publish"] }));
  assert.equal(execution.receipt.status, "pending_approval");
  assert.equal(execution.receipt.risk.approval_required, true);
});

test("critical action is denied before adapter execution", async () => {
  const repositories = await seededRepositories();
  const execution = await new RuntimeOrchestrator({ repositories }).run(intent({ requested_actions: ["access_seed_phrase"] }));
  assert.equal(execution.receipt.status, "denied");
  assert.equal(execution.receipt.risk.level, "critical");
  assert.equal(execution.output, undefined);
});
