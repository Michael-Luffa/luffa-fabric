import test from "node:test";
import assert from "node:assert/strict";
import { parseWith, ValidationError } from "../../packages/core/src/schemas/index.ts";
import { validateAgentResource } from "../../packages/core/src/resources/agent.resource.ts";
import { validateCapabilityGrant } from "../../packages/core/src/resources/capability.resource.ts";
import { validateContextResource } from "../../packages/core/src/resources/context.resource.ts";
import { validateWorkflowResource } from "../../packages/core/src/resources/workflow.resource.ts";
import { validateExecutionIntent } from "../../packages/core/src/resources/execution-intent.resource.ts";
import { validateFeedbackResource } from "../../packages/core/src/resources/feedback.resource.ts";
import { agent, capability, context, workflow, intent } from "../helpers.ts";

test("resource validators accept valid MVP1 resources", () => {
  assert.equal(parseWith("AgentResource", agent(), validateAgentResource).kind, "AgentResource");
  assert.equal(parseWith("CapabilityGrant", capability(), validateCapabilityGrant).kind, "CapabilityGrant");
  assert.equal(parseWith("ContextResource", context(), validateContextResource).kind, "ContextResource");
  assert.equal(parseWith("WorkflowResource", workflow(), validateWorkflowResource).kind, "WorkflowResource");
  assert.equal(parseWith("ExecutionIntent", intent(), validateExecutionIntent).kind, "ExecutionIntent");
});

test("capability validator rejects forbidden capability actions", () => {
  assert.throws(() => capability({ actions: ["read", "export_private_key"] }), ValidationError);
});

test("workflow validator requires stable unique step ids", () => {
  assert.throws(() => workflow({
    steps: [
      { id: "same", action: "read", resource: "luffa://community/123/channel/public" },
      { id: "same", action: "summarize" }
    ]
  }), ValidationError);
});

test("validators reject private credential material fields", () => {
  assert.throws(() => parseWith("AgentResource", { ...agent(), private_key: "0x" + "a".repeat(64) }, validateAgentResource), ValidationError);
  assert.throws(() => parseWith("ExecutionIntent", { ...intent(), input: { private_key: "0x" + "b".repeat(64) } }, validateExecutionIntent), ValidationError);
  assert.throws(() => parseWith("FeedbackResource", {
    kind: "FeedbackResource",
    version: "1.0",
    feedback_id: "fb_bad",
    receipt_id: "receipt_001",
    source: "user",
    source_did: "did:luffa:user:owner001",
    label: "accepted",
    score: 5,
    comment: "ok",
    verified: true,
    weight: 1,
    created_at: "2026-05-25T00:00:00Z",
    seed_phrase: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  }, validateFeedbackResource), ValidationError);
});
