import test from "node:test";
import assert from "node:assert/strict";
import { ContextBoundaryChecker } from "../../packages/core/src/runtime/context.boundary.checker.ts";
import { seededRepositories, agent, workflow } from "../helpers.ts";

test("ContextBoundaryChecker allows active public same-namespace context", async () => {
  const repositories = await seededRepositories();
  const result = await new ContextBoundaryChecker(repositories.contexts).check(agent(), workflow(), ["ctx_community_123_public"]);
  assert.equal(result.ok, true);
});

test("ContextBoundaryChecker denies private context scope", async () => {
  const repositories = await seededRepositories({ contextOverride: { scope: "user_private" } });
  const result = await new ContextBoundaryChecker(repositories.contexts).check(agent(), workflow(), ["ctx_community_123_public"]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /private_context/);
});

test("ContextBoundaryChecker denies cross-namespace workflow resources", async () => {
  const repositories = await seededRepositories({
    workflowOverride: {
      steps: [
        { id: "resolve_context", action: "read", resource: "luffa://community/999/channel/public" },
        { id: "summarize", action: "summarize" }
      ]
    }
  });
  const result = await new ContextBoundaryChecker(repositories.contexts).check(agent(), workflow({
    steps: [
      { id: "resolve_context", action: "read", resource: "luffa://community/999/channel/public" },
      { id: "summarize", action: "summarize" }
    ]
  }), ["ctx_community_123_public"]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /resource_namespace_violation/);
});
