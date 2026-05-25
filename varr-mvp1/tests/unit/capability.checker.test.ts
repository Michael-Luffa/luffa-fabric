import test from "node:test";
import assert from "node:assert/strict";
import { CapabilityChecker } from "../../packages/core/src/runtime/capability.checker.ts";
import { seededRepositories, agent, workflow, capability } from "../helpers.ts";

test("CapabilityChecker allows active unexpired grants", async () => {
  const repositories = await seededRepositories();
  const result = await new CapabilityChecker(repositories.capabilities).check(agent(), workflow(), ["read", "summarize", "draft_post", "generate_receipt"]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.capability_ids, ["cap_community_read_001"]);
});

test("CapabilityChecker denies expired grants", async () => {
  const repositories = await seededRepositories({ includeCapability: false });
  await repositories.capabilities.create(capability({ constraints: { ...capability().constraints, expires_at: "2000-01-01T00:00:00Z" } }));
  const result = await new CapabilityChecker(repositories.capabilities).check(agent(), workflow(), ["read"]);
  assert.equal(result.ok, false);
});

test("CapabilityChecker denies revoked grants", async () => {
  const repositories = await seededRepositories({ capabilityOverride: { status: "revoked" } });
  const result = await new CapabilityChecker(repositories.capabilities).check(agent(), workflow(), ["read"]);
  assert.equal(result.ok, false);
});
