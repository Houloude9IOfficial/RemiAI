import { eq } from "drizzle-orm";
import { generateText, stepCountIs } from "ai";
import { db } from "@/db";
import { automationRuns, heartbeats, mcpServers, providers } from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { buildContextTools } from "@/lib/tools/context";
import { buildIntegrationTools } from "@/lib/tools/integrations";
import { buildMemoryTools } from "@/lib/tools/memories";
import { webFetchTool } from "@/lib/tools/web-fetch";
import { buildHttpRequestTool } from "@/lib/tools/http-request";
import { createMcpToolsManager } from "@/lib/mcp/tools";
import { normaliseTool, estimateTokenCount } from "@/lib/utils";
import { createAutomationRun, finishAutomationRun, recordHeartbeatToolCall, startAutomationRun } from "@/lib/runs/automation";

export type HeartbeatRow = typeof heartbeats.$inferSelect;

const SAFE_TOOLS: Record<string, unknown> = {
  ...buildContextTools(),
  web_fetch: webFetchTool,
  ...buildMemoryTools(),
};

function selectedTools(all: Record<string, unknown>, heartbeat: HeartbeatRow) {
  const allowed = new Set([...heartbeat.allowedToolNames, ...heartbeat.allowedToolGroups]);
  if (allowed.size === 0) return {};
  return Object.fromEntries(Object.entries(all).filter(([name]) =>
    allowed.has(name) || heartbeat.allowedToolGroups.some((group) => name.startsWith(`${group}__`)),
  ));
}

export async function executeHeartbeat(heartbeat: HeartbeatRow, existingRunId?: number) {
  const provider = heartbeat.providerId
    ? await db.select().from(providers).where(eq(providers.id, heartbeat.providerId)).get()
    : await db.select().from(providers).where(eq(providers.enabled, true)).get();
  if (!provider) throw new Error("No enabled provider is configured for this Heartbeat");
  if (!heartbeat.modelId) throw new Error("No model is configured for this Heartbeat");

  const run = existingRunId
    ? await db.select().from(automationRuns).where(eq(automationRuns.id, existingRunId)).get()
    : await createAutomationRun({
      kind: "heartbeat",
      heartbeatId: heartbeat.id,
      name: heartbeat.name,
      task: heartbeat.prompt,
      maxAttempts: heartbeat.maxAttempts,
    });
  if (!run) throw new Error("Heartbeat run not found");
  await startAutomationRun(run.id);

  let closeMcp: (() => Promise<void>) | undefined;
  try {
    const servers = heartbeat.allowedMcpServerIds.length
      ? await db.select().from(mcpServers).where(eq(mcpServers.enabled, true)).all()
      : [];
    const selectedServers = servers.filter((server) => heartbeat.allowedMcpServerIds.includes(server.id));
    const mcp = selectedServers.length ? await createMcpToolsManager(selectedServers) : null;
    closeMcp = mcp?.close;
    const allTools = {
      ...SAFE_TOOLS,
      ...(await buildIntegrationTools()),
      ...(mcp?.tools ?? {}),
      ...(heartbeat.allowedToolNames.includes("http_request") ? { http_request: buildHttpRequestTool({ mode: "sandboxed", allowMutations: false }) } : {}),
    };
    const tools = Object.fromEntries(Object.entries(selectedTools(allTools, heartbeat)).map(([name, tool]) => [name, normaliseTool(tool as Record<string, unknown>)]));
    const startedAt = Date.now();
    const result = await Promise.race([
      generateText({
        model: getLanguageModel(provider, heartbeat.modelId),
        instructions: `You are running autonomously as the Heartbeat "${heartbeat.name}".\n\n${heartbeat.prompt}\n\nDo not ask the user questions. Complete the work with available tools, and report what happened succinctly.`,
        messages: [{ role: "user", content: heartbeat.prompt }],
        tools: Object.keys(tools).length ? tools as any : undefined,
        stopWhen: stepCountIs(Math.min(50, Math.max(1, heartbeat.maxSteps))),
        maxRetries: Math.min(3, Math.max(0, heartbeat.maxAttempts - 1)),
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Heartbeat timed out after ${heartbeat.timeoutSeconds}s`)), heartbeat.timeoutSeconds * 1000)),
    ]);
    const output = result.text ?? "";
    const calls = result.toolCalls ?? [];
    for (const call of calls) {
      await recordHeartbeatToolCall({
        runId: run.id,
        callId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
        status: "completed",
      });
    }
    const inputTokens = result.usage?.inputTokens ?? estimateTokenCount(heartbeat.prompt);
    const outputTokens = result.usage?.outputTokens ?? estimateTokenCount(output);
    await finishAutomationRun(run.id, {
      status: "completed",
      result: output,
      checkpoint: { inputTokens, outputTokens, stepCount: result.steps.length, toolCallCount: calls.length, durationMs: Date.now() - startedAt },
    });
    return { runId: run.id, output };
  } catch (error) {
    await finishAutomationRun(run.id, { status: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    await closeMcp?.();
  }
}
