import assert from "node:assert/strict";
import { RESEARCH_SECTION } from "../lib/chat/system-prompt";

assert.match(RESEARCH_SECTION, /original and official documentation.*primary sources/i);
assert.match(RESEARCH_SECTION, /Wikipedia for orientation.*verify important facts/i);
assert.match(RESEARCH_SECTION, /academic, government, institutional, and reputable editorial sources/i);
assert.match(RESEARCH_SECTION, /lower-confidence sources only when trusted coverage is unavailable/i);
assert.match(RESEARCH_SECTION, /never rely on one alone for an important claim/i);
assert.match(RESEARCH_SECTION, /concise synthesis.*relevant to the user's question/i);
assert.match(RESEARCH_SECTION, /do not dump the raw result list/i);

console.log("\n✅ Research prompt source-quality policy test passed.");
