import test from "node:test";
import assert from "node:assert/strict";
import { RiskClassifier } from "../../packages/core/src/runtime/risk.classifier.ts";

test("RiskClassifier maps low, medium, high, and critical actions", () => {
  const classifier = new RiskClassifier();
  assert.equal(classifier.classify(["read", "summarize"]).level, "low");
  assert.equal(classifier.classify(["external_api_call"]).level, "medium");
  assert.equal(classifier.classify(["publish"]).level, "high");
  assert.equal(classifier.classify(["access_seed_phrase"]).level, "critical");
});
