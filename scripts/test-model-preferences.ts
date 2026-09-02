import assert from "node:assert/strict";
import {
  DEFAULT_ENABLE_NEW_MODELS,
  resolveNewModelEnabled,
} from "../lib/providers/model-preferences-policy";

assert.equal(DEFAULT_ENABLE_NEW_MODELS, true);
assert.equal(resolveNewModelEnabled(true), true);
assert.equal(resolveNewModelEnabled(false), false);
assert.equal(resolveNewModelEnabled(undefined), true);
assert.equal(resolveNewModelEnabled(null), true);

console.log("\nAll new-model preference tests passed.");
