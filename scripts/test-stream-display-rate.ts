/**
 * Regression tests for streamed-message reveal rates.
 * Run with: npx tsx scripts/test-stream-display-rate.ts
 */
import assert from "node:assert/strict";
import {
  getStreamDisplayCharsPerSecond,
  MAX_STREAM_DISPLAY_CHARS_PER_SECOND,
  STREAM_CATCH_UP_MAX_SECONDS,
} from "../lib/chat/stream-display-rate";

assert.equal(
  getStreamDisplayCharsPerSecond(1_300, true),
  MAX_STREAM_DISPLAY_CHARS_PER_SECOND,
  "an active message must keep the normal cap",
);

assert.equal(
  getStreamDisplayCharsPerSecond(650, false),
  MAX_STREAM_DISPLAY_CHARS_PER_SECOND,
  "a 650-character final backlog should finish at the normal five-second rate",
);

assert.equal(
  getStreamDisplayCharsPerSecond(1_300, false),
  260,
  "a 1,300-character final backlog should accelerate to finish within five seconds",
);

assert.equal(
  getStreamDisplayCharsPerSecond(25, false),
  MAX_STREAM_DISPLAY_CHARS_PER_SECOND,
  "small final backlogs must not be artificially delayed",
);

assert.equal(
  getStreamDisplayCharsPerSecond(0, false),
  MAX_STREAM_DISPLAY_CHARS_PER_SECOND,
  "a fully visible response needs no catch-up rate",
);

assert.equal(
  getStreamDisplayCharsPerSecond(-10, false),
  MAX_STREAM_DISPLAY_CHARS_PER_SECOND,
  "a shortened or recovered response must not produce an invalid rate",
);

assert.equal(STREAM_CATCH_UP_MAX_SECONDS, 5);
console.log("✓ streamed-message display rates");
