import assert from "node:assert/strict";
import { SignupCodeCapture } from "../electron/signup-code";

const capture = new SignupCodeCapture();

assert.equal(capture.push("ready\n🔐 RemiAI signup co"), null);
assert.equal(capture.push("de: a1b2c3d4e5f6\nUse this code"), "A1B2C3D4E5F6");

capture.reset();
assert.equal(capture.push("RemiAI signup code: not-a-code"), null);
assert.equal(capture.push("RemiAI signup code: ABCD1234"), null);
assert.equal(capture.push("ordinary server output"), null);

console.log("Electron signup-code capture tests passed.");
