import assert from "node:assert/strict";
import {
  summarizeBuildCheckCounts,
  summarizeBuildChecks,
} from "../lib/chat/build-verification";

const checks = summarizeBuildChecks([
  {
    type: "tool-bash_execute",
    state: "output-available",
    input: { command: "npm test" },
    output: { exitCode: 0, timedOut: false },
  },
  {
    type: "tool-bash_execute",
    state: "output-available",
    input: { command: "npm run build" },
    output: { exitCode: 1, timedOut: false },
  },
  {
    type: "tool-bash_execute",
    state: "output-available",
    input: {
      command: "npm run start -- --port 4173 & server=$!; sleep 2; curl -fsS http://127.0.0.1:4173/ >/dev/null; kill $server",
    },
    output: { exitCode: 0, timedOut: false },
  },
  {
    type: "tool-python_exec",
    state: "output-available",
    input: { code: "print('hello')" },
    output: { exitCode: 0, timedOut: true },
  },
  {
    type: "tool-js_exec",
    state: "output-available",
    input: { code: "console.log('no exit code')" },
    output: {},
  },
  {
    type: "tool-bash_execute",
    state: "input-available",
    input: { command: "npm run lint" },
  },
]);

assert.equal(checks.length, 5);
assert.deepEqual(summarizeBuildCheckCounts(checks), {
  passed: 2,
  failed: 2,
  incomplete: 1,
});
assert.equal(checks[0].status, "passed");
assert.equal(checks[1].status, "failed");
assert.equal(checks[2].kind, "preview");
assert.equal(checks[3].detail, "Timed out");
assert.equal(checks[4].status, "incomplete");
assert.match(checks[2].command, /npm run start/);

console.log("\n✅ All build verification tests passed.");
