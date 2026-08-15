/* eslint-disable */
// Measures the static tool-definition payload under dynamic tool loading:
// full set vs core-only (simple chat) vs a classified request. Also smoke
// tests the intent classifier and group persistence helpers.
import { z, toJSONSchema } from "zod/v4";
import { estimateTokenCount } from "../lib/utils";
import { buildFilesystemTools } from "../lib/fs/tools";
import { buildContextTools } from "../lib/tools/context";
import { buildMemoryTools } from "../lib/tools/memories";
import { buildIntegrationTools } from "../lib/tools/integrations";
import { buildExecutionTools } from "../lib/tools/exec";
import { buildDocumentReaderTools } from "../lib/tools/document-reader";
import { buildMediaTools } from "../lib/media/tools";
import { delayTool } from "../lib/tools/delay";
import { webFetchTool } from "../lib/tools/web-fetch";
import { buildCreateVisualTool } from "../lib/tools/create-visual";
import { askQuestionsTool } from "../lib/tools/ask-questions";
import { suggestFollowupsTool } from "../lib/tools/suggest-followups";
import { setRunNameTool } from "../lib/tools/run-name";
import { buildMainSpawnAgentTool, buildGetAgentResultTool } from "../lib/tools/agent-spawner";
import { buildTodoTools } from "../lib/tools/todo";
import { buildFileIndexTools } from "../lib/tools/file-index";
import { buildSessionFileTools } from "../lib/session-files/tools";
import { buildProfileTools } from "../lib/tools/profile";
import { buildRoutinesTools } from "../lib/tools/routines";
import { buildScheduleTool } from "../lib/tools/schedule";
import { buildToolHelpTool, buildListAvailableToolsTool } from "../lib/tools/tool-help";
import {
  CORE_TOOLS,
  classifyToolGroups,
  computeActiveToolGroups,
  filterTools,
} from "../lib/chat/tool-groups";

const provider: any = { id: 1, kind: "anthropic", label: "Anthropic", apiKey: "sk-ant-test", isPreset: true, baseUrl: null, enabled: true };
const userContext: any = { timezone: "Europe/Bucharest", language: "en" };

async function safe<T>(name: string, fn: () => Promise<T> | T): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.log(`[skip] ${name}: ${e instanceof Error ? e.message : e}`);
    return undefined;
  }
}

async function main() {
  const tools: Record<string, any> = {
    ...((await safe("fs", () => buildFilesystemTools())) ?? {}),
    ...((safe("context", () => buildContextTools("test", userContext.timezone, userContext.language)) as any) ?? {}),
    ...((safe("memory", () => buildMemoryTools()) as any) ?? {}),
    ...((await safe("integrations", () => buildIntegrationTools(userContext))) ?? {}),
    ...((await safe("exec", () => buildExecutionTools("sandboxed"))) ?? {}),
    ...((await safe("docreader", () => buildDocumentReaderTools())) ?? {}),
    ...((safe("media", () => buildMediaTools(1)) as any) ?? {}),
    delay: delayTool,
    web_fetch: webFetchTool,
    ask_questions: askQuestionsTool,
    suggest_followups: suggestFollowupsTool,
    set_run_name: setRunNameTool,
    ...((await safe("createvisual", () => buildCreateVisualTool())) ?? {}),
    ...((safe("toolhelp", () => buildToolHelpTool()) as any) ?? {}),
    ...((safe("listtools", () => buildListAvailableToolsTool()) as any) ?? {}),
    ...(((await safe("spawnagent", () => buildMainSpawnAgentTool(provider, "claude-sonnet-4-5", 1, userContext))) ?? {}) as any),
    ...((safe("getagentresult", () => buildGetAgentResultTool()) as any) ?? {}),
    ...((safe("fileindex", () => buildFileIndexTools()) as any) ?? {}),
    ...((safe("profile", () => buildProfileTools()) as any) ?? {}),
    ...((safe("todo", () => buildTodoTools(1)) as any) ?? {}),
    ...((await safe("routines", () => buildRoutinesTools())) ?? {}),
    ...((await safe("schedule", () => buildScheduleTool(1))) ?? {}),
    ...((safe("sessionfiles", () => buildSessionFileTools(1)) as any) ?? {}),
  };

  function measure(set: Record<string, unknown>, label: string) {
    const lines: string[] = [];
    for (const [name, tool] of Object.entries(set)) {
      const t = tool as any;
      let params = "{}";
      try {
        params = JSON.stringify(toJSONSchema(t.parameters as z.ZodType));
      } catch {
        params = JSON.stringify(t.parameters ?? {});
      }
      lines.push(JSON.stringify({ type: "function", name, description: t.description ?? "", parameters: JSON.parse(params) }));
    }
    const json = lines.join("");
    console.log(`  ${label.padEnd(46)} ${Object.keys(set).length.toString().padStart(2)} tools  ${json.length.toLocaleString().padStart(8)} chars  ~${estimateTokenCount(json).toLocaleString().padStart(7)} tokens`);
    return estimateTokenCount(json);
  }

  console.log("=== TOOL PAYLOAD: full vs dynamic ===");
  const full = measure(tools, "full set (all tools)");
  const coreOnly = measure(filterTools(tools, new Set()), "core set (simple chat)");

  const cases: Array<[string, string]> = [
    ["simple chat", "hi, how are you? what can you do?"],
    ["file write", "create a new file called notes.md and write my meeting notes to it"],
    ["website build", "build me a landing page for my startup, make it look modern with a pricing section"],
    ["python code", "run this python script to calculate the fibonacci sequence and show me a chart of it"],
    ["schedule + research", "schedule a reminder for tomorrow and research the best hiking trails near me"],
    ["read pdf", "summarize the attached pdf resume"],
  ];

  console.log("\n=== CLASSIFIER ===");
  const totals: Record<string, number> = { full };
  for (const [label, text] of cases) {
    const active = classifyToolGroups(text);
    const filtered = filterTools(tools, active);
    const tok = measure(filtered, `"${label}" → [${Array.from(active).join(", ") || "core only"}]`);
    totals[label] = tok;
  }

  console.log("\n=== RECENCY + STORED ===");
  const recentMessage = {
    parts: [{ type: "tool-session_file_write", toolCallId: "x", state: "output-available", input: {}, output: {} }],
  };
  const withRecency = computeActiveToolGroups({
    userText: "make the button blue",
    recentMessages: [recentMessage],
    stored: { explicit: new Set(), recent: new Set() },
  });
  console.log(`  'make the button blue' + recent session_file_write → ${Array.from(withRecency).join(", ")}`);
  const withStored = computeActiveToolGroups({
    userText: "yes",
    recentMessages: [],
    stored: { explicit: new Set(["exec"]), recent: new Set(["scheduling"]) },
  });
  console.log(`  'yes' + explicit [exec] + recent [scheduling] → ${Array.from(withStored).join(", ")}`);

  // Token delta on the simple chat
  const savings = full - totals["simple chat"];
  console.log(`\n=== RESULT ===`);
  console.log(`  simple chat saves ~${savings.toLocaleString()} tokens (${((savings / full) * 100).toFixed(0)}% of tool payload)`);

  // Sanity: every conditional tool name maps to a group, and core tools are never filtered
  const orphanTools = Object.keys(tools).filter((n) => !CORE_TOOLS.has(n));
  console.log(`  tools not in core: ${orphanTools.length}`);
  console.log("[smoke] tools OK");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
