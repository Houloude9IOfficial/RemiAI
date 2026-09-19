import assert from "node:assert/strict";
import { RESEARCH_SECTION } from "../lib/chat/system-prompt";

assert.match(RESEARCH_SECTION, /original and official documentation.*primary sources/i);
assert.match(RESEARCH_SECTION, /Wikipedia for orientation.*verify important facts/i);
assert.match(RESEARCH_SECTION, /academic, government, institutional, and reputable editorial sources/i);
assert.match(RESEARCH_SECTION, /lower-confidence sources only when trusted coverage is unavailable/i);
assert.match(RESEARCH_SECTION, /never rely on one alone for an important claim/i);

console.log("\n✅ Research prompt source-quality policy test passed.");
