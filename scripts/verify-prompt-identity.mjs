// Verify the refactored system-prompt builder produces byte-identical output
// for memory-enabled prompts (SYSTEM_PROMPT_BASE / SYSTEM_PROMPT) compared to
// the pre-refactor versions from git HEAD.
// Run with: npx tsx scripts/verify-prompt-identity.mjs
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const newPath = path.join(root, "lib/chat/system-prompt.ts");

// Pull the pre-refactor file from git
const orig = execSync("git show HEAD:lib/chat/system-prompt.ts", { cwd: root }).toString();

const BS = "\\"; // single backslash

/**
 * Extract the body of `export const NAME = `...` (+ MORE ...);` from the
 * original source, reconstructing the FULL concatenated string value.
 */
function extractOriginal(src, name) {
  const marker = "export const " + name + " = `";
  const start = src.indexOf(marker);
  if (start < 0) throw new Error("original " + name + " not found");
  const bodyStart = start + marker.length;

  // Scan for the closing backtick, skipping backslash-escaped ones (\`).
  let i = bodyStart;
  while (i < src.length) {
    if (src[i] === BS) {
      i += 2;
      continue;
    }
    if (src[i] === "`") break;
    i += 1;
  }
  if (i >= src.length) throw new Error("unterminated template for " + name);

  const template = unescapeTemplate(src.slice(bodyStart, i));

  // Tail after the closing backtick: ` + SECTION + `...` + SECTION ...;`
  // Parse it properly: `+` refs interleaved with inline template literals
  // (skipping those, since their content is NOT part of the concatenation
  // at this level), stopping at the terminating `;`.
  let result = template;
  let p = i + 1;
  while (p < src.length) {
    // Skip whitespace
    while (p < src.length && /\s/.test(src[p])) p += 1;
    if (p >= src.length || src[p] === ";") break;
    if (src[p] === "+") {
      p += 1;
      while (p < src.length && /\s/.test(src[p])) p += 1;
      if (src[p] === "`") {
        // `+ \`inline template\`` — evaluated content is part of the value.
        const tpl = skipTemplate(src, p);
        result += unescapeTemplate(tpl.raw);
        p = tpl.next;
      } else {
        const identMatch = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(p));
        if (!identMatch) throw new Error("bad tail after + at " + p + " for " + name);
        result += extractOriginal(src, identMatch[1]);
        p += identMatch[1].length;
      }
    } else if (src[p] === "`") {
      // Inline template literal without a preceding + (escapes respected).
      const tpl = skipTemplate(src, p);
      p = tpl.next;
    } else {
      throw new Error("unexpected char " + JSON.stringify(src[p]) + " in tail of " + name);
    }
  }
  return result;
}

/**
 * Skip an inline template literal at position p (src[p] === '`') and return
 * the RAW content between the backticks (escapes preserved). Advances p past
 * the closing backtick.
 */
function skipTemplate(src, p) {
  const open = p;
  p += 1;
  while (p < src.length) {
    if (src[p] === BS) {
      p += 2;
      continue;
    }
    if (src[p] === "`") {
      const raw = src.slice(open + 1, p);
      return { raw, next: p + 1 };
    }
    p += 1;
  }
  throw new Error("unterminated inline template at " + open);
}

/**
 * Turn raw template-literal source into its evaluated value. The prompt files
 * mix styles: some sections are written with real newlines, others (the
 * WEB_ACCESS/MEDIA/TOOL_ROLE_* consts) with literal \\n escapes. Handle the
 * escapes actually used: \\n → newline, \\` → backtick, \\" → double quote.
 */
function unescapeTemplate(raw) {
  return raw
    .split("\\n").join("\n")
    .split("\\`").join("`")
    .split('\\"').join('"');
}

// Load the NEW module and read its exported prompts directly.
const mod = await import(pathToFileURL(newPath).href);

const cases = [
  ["SYSTEM_PROMPT_BASE", extractOriginal(orig, "SYSTEM_PROMPT_BASE"), mod.SYSTEM_PROMPT_BASE],
  ["SYSTEM_PROMPT", extractOriginal(orig, "SYSTEM_PROMPT"), mod.SYSTEM_PROMPT],
];

let failed = 0;
for (const [name, expected, actual] of cases) {
  if (typeof actual !== "string") {
    console.log("x " + name + " could not be loaded from new module");
    failed++;
    continue;
  }
  if (expected === actual) {
    console.log("ok " + name + " byte-identical (" + expected.length + " chars)");
  } else {
    failed++;
    let i = 0;
    while (i < Math.min(expected.length, actual.length) && expected[i] === actual[i]) i++;
    console.log("x " + name + " differs at index " + i);
    console.log("  expected: " + JSON.stringify(expected.slice(Math.max(0, i - 60), i + 80)));
    console.log("  actual:   " + JSON.stringify(actual.slice(Math.max(0, i - 60), i + 80)));
  }
}

// Sanity-check the no-memory variants
for (const name of ["SYSTEM_PROMPT_BASE_NO_MEMORY", "SYSTEM_PROMPT_NO_MEMORY"]) {
  const v = mod[name];
  if (typeof v !== "string") {
    console.log("x " + name + " missing");
    failed++;
    continue;
  }
  const ok =
    v.includes("fully isolated") &&
    !v.includes("save proactively") &&
    !v.includes("query_recent_changes");
  console.log((ok ? "ok " : "x ") + name + " no-memory variant " + (ok ? "OK" : "unexpected content"));
  if (!ok) failed++;
}

process.exit(failed ? 1 : 0);
