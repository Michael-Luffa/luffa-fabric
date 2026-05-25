import test from "node:test";
import assert from "node:assert/strict";
import type { AdapterExecutionRequest, AdapterExecutionResult, ExecutionAdapter } from "../../packages/core/src/adapters/execution.adapter.ts";
import { MockExecutionAdapter } from "../../packages/core/src/adapters/mock.execution.adapter.ts";
import { RuntimeOrchestrator } from "../../packages/core/src/runtime/runtime.orchestrator.ts";
import type { RuntimeExecutionAuthorization } from "../../packages/core/src/runtime/execution.runner.ts";
import { FeedbackProcessor } from "../../packages/core/src/runtime/feedback.processor.ts";
import { LearningSignalEmitter } from "../../packages/core/src/runtime/learning.signal.emitter.ts";
import { seededRepositories, capability, intent } from "../helpers.ts";

test("adapter cannot execute directly without runtime authorization", async () => {
  const adapter = new MockExecutionAdapter();
  await assert.rejects(
    () => adapter.execute({ intent: intent(), workflow: {} as never, contexts: [], actions: ["read"] }, {} as RuntimeExecutionAuthorization),
    /RuntimeOrchestrator authorization/
  );
  assert.equal(adapter.executionCount, 0);
});

test("adapters are not invoked before capability checks pass", async () => {
  class SpyAdapter implements ExecutionAdapter {
    readonly name = "mock";
    calls = 0;
    async execute(_request: AdapterExecutionRequest, _authorization: RuntimeExecutionAuthorization): Promise<AdapterExecutionResult> {
      this.calls += 1;
      return { summary: "should not happen", output: {}, compute_units: 1 };
    }
  }

  const spy = new SpyAdapter();
  const repositories = await seededRepositories({ includeCapability: false });
  const execution = await new RuntimeOrchestrator({ repositories, adapters: [spy] }).run(intent());
  assert.equal(execution.receipt.status, "denied");
  assert.equal(spy.calls, 0);
});

test("every runtime path creates a receipt", async () => {
  const missingCapability = await seededRepositories({ includeCapability: false });
  assert.equal((await new RuntimeOrchestrator({ repositories: missingCapability }).run(intent())).receipt.status, "denied");
  assert.equal((await missingCapability.receipts.list()).length, 1);

  const highRisk = await seededRepositories({
    includeCapability: false,
    workflowOverride: {
      steps: [
        { id: "resolve_context", action: "read", resource: "luffa://community/123/channel/public" },
        { id: "publish", action: "publish" }
      ],
      risk_profile: "high"
    }
  });
  await highRisk.capabilities.create(capability({ actions: ["read", "publish"] }));
  assert.equal((await new RuntimeOrchestrator({ repositories: highRisk }).run(intent({ requested_actions: ["read", "publish"] }))).receipt.status, "pending_approval");
  assert.equal((await highRisk.receipts.list()).length, 1);

  const critical = await seededRepositories();
  assert.equal((await new RuntimeOrchestrator({ repositories: critical }).run(intent({ requested_actions: ["export_private_key"] }))).receipt.status, "denied");
  assert.equal((await critical.receipts.list()).length, 1);

  class FailingAdapter implements ExecutionAdapter {
    readonly name = "mock";
    async execute(): Promise<AdapterExecutionResult> {
      throw new Error("adapter exploded");
    }
  }
  const adapterFailure = await seededRepositories();
  assert.equal((await new RuntimeOrchestrator({ repositories: adapterFailure, adapters: [new FailingAdapter()] }).run(intent())).receipt.status, "failed");
  assert.equal((await adapterFailure.receipts.list()).length, 1);
});

test("cross-namespace context access is denied with receipt", async () => {
  const repositories = await seededRepositories({
    workflowOverride: {
      steps: [
        { id: "resolve_context", action: "read", resource: "luffa://community/999/channel/public" },
        { id: "summarize", action: "summarize" }
      ]
    }
  });
  const execution = await new RuntimeOrchestrator({ repositories }).run(intent({ requested_actions: ["read", "summarize"] }));
  assert.equal(execution.receipt.status, "denied");
  assert.match(execution.receipt.summary, /Context boundary violation/);
  assert.equal((await repositories.receipts.list()).length, 1);
});

test("feedback without a valid receipt is denied", async () => {
  const repositories = await seededRepositories();
  const result = await new FeedbackProcessor(
    repositories.feedback,
    repositories.receipts,
    new LearningSignalEmitter(repositories.learningSignals, repositories.contexts)
  ).submit({
    kind: "FeedbackResource",
    version: "1.0",
    feedback_id: "fb_missing",
    receipt_id: "receipt_missing",
    source: "user",
    source_did: "did:luffa:user:owner001",
    label: "accepted",
    score: 5,
    comment: "No receipt.",
    verified: true,
    weight: 1,
    created_at: "2026-05-25T00:00:00Z"
  });
  assert.equal(result.ok, false);
});
