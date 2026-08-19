import assert from "node:assert/strict";
import {
  chooseQualityStrategy,
  estimateTaskComplexity,
  normalizeQualityPolicy,
} from "../lib/chat/quality-policy";
import { chooseModelRoute } from "../lib/chat/model-routing";

assert.equal(normalizeQualityPolicy("fast"), "fast");
assert.equal(normalizeQualityPolicy("unknown"), "balanced");
assert.equal(estimateTaskComplexity("What time is it?"), "simple");
assert.equal(
  estimateTaskComplexity(
    "Inspect the repository, implement the migration, run tests and build, then report the changed files.",
    "build",
  ),
  "complex",
);

const fast = chooseQualityStrategy("fast", "simple");
assert.equal(fast.maxRetries, 1);
assert.equal(fast.maxOutputTokens, 2048);

const quality = chooseQualityStrategy("quality", "complex");
assert.equal(quality.maxRetries, 3);
assert.equal(quality.maxOutputTokens, 16384);
assert.match(quality.verificationGuidance, /deterministic checks/i);

const selected = chooseQualityStrategy("selected", "moderate");
assert.match(selected.verificationGuidance, /selected model/i);

const selectedModel = {
  providerId: 1,
  providerKind: "anthropic",
  providerLabel: "Anthropic",
  modelId: "claude-haiku-4-5-20251001",
};
const strongCandidates = [
  selectedModel,
  {
    providerId: 1,
    providerKind: "anthropic",
    providerLabel: "Anthropic",
    modelId: "claude-sonnet-5",
  },
  {
    providerId: 2,
    providerKind: "openai",
    providerLabel: "OpenAI",
    modelId: "gpt-4.1",
  },
];

const escalated = chooseModelRoute({
  policy: "quality",
  complexity: "complex",
  text: "Implement the repository change, run tests, and verify the API behavior.",
  mode: "build",
  selected: selectedModel,
  candidates: strongCandidates,
});
assert.equal(escalated.escalated, true);
assert.equal(escalated.active.modelId, "gpt-4.1");
assert.equal(escalated.verifierEligible, true);
assert.equal(escalated.expectedCost, "higher");

const pinnedBalanced = chooseModelRoute({
  policy: "balanced",
  complexity: "complex",
  text: "Implement the repository change and run tests.",
  mode: "build",
  selected: selectedModel,
  candidates: strongCandidates,
});
assert.equal(pinnedBalanced.escalated, false);
assert.equal(pinnedBalanced.active.modelId, selectedModel.modelId);
assert.equal(pinnedBalanced.verifierEligible, false);

const pinnedSelected = chooseModelRoute({
  policy: "selected",
  complexity: "complex",
  text: "Implement the repository change and run tests.",
  mode: "build",
  selected: selectedModel,
  candidates: strongCandidates,
});
assert.equal(pinnedSelected.escalated, false);
assert.match(pinnedSelected.reason, /pinned/i);

const noSafeAlternative = chooseModelRoute({
  policy: "quality",
  complexity: "complex",
  text: "Analyze this task carefully.",
  mode: "chat",
  selected: {
    providerId: 3,
    providerKind: "openai-compatible",
    providerLabel: "Custom",
    modelId: "custom-model",
  },
  candidates: [
    {
      providerId: 3,
      providerKind: "openai-compatible",
      providerLabel: "Custom",
      modelId: "custom-model-2",
    },
  ],
});
assert.equal(noSafeAlternative.escalated, false);
assert.match(noSafeAlternative.reason, /no safe stronger/i);

// Deterministic routing benchmark fixture: quality routing must improve the
// capability tier for a complex coding task, while normal policies never do.
const benchmarkPolicies = ["fast", "balanced", "quality", "selected"] as const;
const benchmarkResults = benchmarkPolicies.map((policy) =>
  chooseModelRoute({
    policy,
    complexity: "complex",
    text: "Build and debug the API, edit the files, and run the tests.",
    mode: "build",
    selected: selectedModel,
    candidates: strongCandidates,
  }),
);
assert.equal(benchmarkResults.filter((result) => result.escalated).length, 1);
assert.equal(benchmarkResults.find((result) => result.escalated)?.active.modelId, "gpt-4.1");

console.log("\n✅ All quality policy and routing tests passed.");
