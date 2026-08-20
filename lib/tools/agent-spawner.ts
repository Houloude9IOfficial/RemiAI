import { z } from "zod";
import { streamText, type LanguageModel, type ToolSet } from "ai";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { providers, agentTasks, conversations } from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { markLastToolForCache } from "@/lib/chat/prompt-cache";
import { buildFilesystemTools } from "@/lib/fs/tools";
import { buildMemoryTools } from "@/lib/tools/memories";
import { buildIntegrationTools } from "@/lib/tools/integrations";
import { buildExecutionTools } from "@/lib/tools/exec";
import { buildDocumentReaderTools } from "@/lib/tools/document-reader";
import { buildMediaTools } from "@/lib/media/tools";
import { delayTool } from "@/lib/tools/delay";
import { webFetchTool } from "@/lib/tools/web-fetch";
import { buildTodoTools } from "@/lib/tools/todo";
import { buildRoutinesTools } from "@/lib/tools/routines";
import { truncateToolResult, estimateTokenCount, normaliseTool } from "@/lib/utils";
import type { UserContext } from "@/lib/geo";
import {
  createAutomationRun,
  finishAutomationRun,
  getAutomationRun,
  scheduleAutomationRetry,
  startAutomationRun,
  updateAutomationRunCheckpoint,
} from "@/lib/runs/automation";

// ---------------------------------------------------------------------------
// Constants & types for agent chaining
// ---------------------------------------------------------------------------

/**
 * Maximum depth of the agent chain tree. 0 = main AI, 1 = child, 2 = grandchild.
 * An agent at depth MAX_CHAIN_DEPTH cannot spawn further sub-agents.
 */
const MAX_CHAIN_DEPTH = 10;

/**
 * Context passed down the agent chain so children can spawn their own
 * sub-agents with the correct provider, model, and parent tracking.
 */
type AgentType = "researcher" | "coder" | "analyst" | "summarizer" | "custom";

interface ChainContext {
  provider: ProviderRow;
  modelId: string;
  conversationId: number;
  parentTaskId: number | null;
  chainDepth: number;
  /** User context (timezone, country, language) — localizes search results. */
  userContext?: UserContext;
}

// ---------------------------------------------------------------------------
// Agent queue — limits concurrent background agent executions
// ---------------------------------------------------------------------------

interface AgentQueueItem {
  providerId: number;
  modelId: string;
  agentType: string;
  task: string;
  taskId: number;
  runId: number;
  chainDepth: number;
  systemPromptOverride?: string;
  userContext?: UserContext;
}

/**
 * Simple in-memory queue for background agent tasks.
 * Processes tasks with a configurable concurrency limit (default 2).
 * When the server restarts, any leftover "queued" tasks are handled
 * by the startup cleanup in db/index.ts.
 */
class AgentQueue {
  private queue: AgentQueueItem[] = [];
  private activeCount = 0;
  private concurrency: number;

  constructor(concurrency: number = 2) {
    this.concurrency = concurrency;
  }

  /** Add a background agent task to the queue */
  enqueue(item: AgentQueueItem): void {
    this.queue.push(item);
    this.tryProcessNext();
  }

  /** Attempt to process the next item in the queue */
  private tryProcessNext(): void {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.activeCount++;
      this.run(item).finally(() => {
        this.activeCount--;
        this.tryProcessNext();
      });
    }
  }

  /** Execute a single agent task */
  private async run(item: AgentQueueItem): Promise<void> {
    // Mark as running first so get_agent_result shows "running" not "queued"
    await db
      .update(agentTasks)
      .set({ status: "running" })
      .where(eq(agentTasks.id, item.taskId))
      .run();

    await executeAgentExecution(
      item.providerId,
      item.modelId,
      item.agentType,
      item.task,
      item.taskId,
      item.chainDepth,
      item.systemPromptOverride,
      item.userContext,
      item.runId,
    );
  }

  /** Number of currently executing background agents */
  get activeCountValue(): number {
    return this.activeCount;
  }

  /** Number of items waiting in the queue */
  get queueLength(): number {
    return this.queue.length;
  }
}

/** Singleton queue instance shared across the application */
const agentQueue = new AgentQueue();

// ---------------------------------------------------------------------------
// Agent profiles — each type has a specialised system prompt
// ---------------------------------------------------------------------------

interface AgentProfile {
  label: string;
  description: string;
  systemPrompt: string;
}

const AGENT_PROFILES: Record<string, AgentProfile> = {
  researcher: {
    label: "Researcher",
    description:
      "Researches topics thoroughly and returns a concise, well-structured summary with sources.",
    systemPrompt: `You are a Research Specialist. Your job is to research the given topic thoroughly and return a comprehensive, well-structured summary.

## Guidelines
- Use web_fetch to read web pages and gather information. Be thorough.
- Use your search tools (if available) to find relevant sources.
- Focus on factual information. If information is unclear or contradictory, note that.
- When you have completed your research, provide a clear, well-organized summary.
- Cite your sources by including URLs.
- Be concise but comprehensive — cover the key points without unnecessary detail.
- Keep your final summary under 2000 words unless the task specifically requires more.

## Available tools
You have access to web_fetch (for reading web pages), delay (for rate limiting), code execution tools (for analysis), and filesystem tools (for reading/writing files). Use them as needed to complete your research task.`,
  },
  coder: {
    label: "Coder",
    description:
      "Writes, analyzes, debugs, and refactors code with working solutions.",
    systemPrompt: `You are a Code Specialist. Your job is to write, analyze, debug, or refactor code based on the given task.

## Guidelines
- Write clean, well-documented, production-quality code.
- Use python_exec or js_exec to test your code before returning it.
- If the task involves fixing a bug, first diagnose the issue, then provide the fix.
- Explain your approach briefly before showing the code.
- For file operations, use the filesystem tools (list_directory, read_file, write_file).
- Always test your code with exec tools and fix any errors.

## Available tools
You have access to python_exec, js_exec (for code execution), filesystem tools (for reading/writing files), delay (for rate limiting), and web_fetch (for documentation). Use them as needed.`,
  },
  analyst: {
    label: "Analyst",
    description:
      "Analyzes data thoroughly and provides actionable insights with supporting numbers.",
    systemPrompt: `You are a Data Analysis Specialist. Your job is to analyze data thoroughly and provide clear, actionable insights.

## Guidelines
- Use python_exec or js_exec for calculations, statistics, and data processing.
- Present your findings clearly with numbers, trends, and comparisons.
- Use tables or structured formats for presenting data.
- Explain your methodology briefly so the user understands how you reached your conclusions.
- If the data is insufficient for a definitive answer, explain what additional data would help.

## Available tools
You have access to python_exec, js_exec (for data processing), filesystem tools (for reading data files), web_fetch (for additional data sources), and delay (for rate limiting). Use them as needed.`,
  },
  summarizer: {
    label: "Summarizer",
    description:
      "Condenses long content into concise, well-structured summaries capturing key points.",
    systemPrompt: `You are a Summarization Specialist. Your job is to read through content and provide a concise, well-structured summary.

## Guidelines
- Focus on the key points, main arguments, and important details.
- Keep summaries well-structured but brief — aim for 10-20% of the original length unless otherwise specified.
- Use bullet points or short paragraphs for clarity.
- Preserve the original meaning and nuance — don't oversimplify.
- If the content has multiple sections, organize your summary accordingly.

## Available tools
You have access to filesystem tools (for reading files), web_fetch (for reading web content), and document reading tools. Use them to access the content you need to summarize.`,
  },
  custom: {
    label: "Custom Agent",
    description:
      "A custom agent defined by the AI with a specific system prompt and task.",
    systemPrompt: "", // Will be overridden by system_prompt_override
  },
};

// ---------------------------------------------------------------------------
// Build tools for sub-agents
// ---------------------------------------------------------------------------

async function buildAgentTools(
  userContext?: UserContext,
  conversationId?: number,
): Promise<Record<string, unknown>> {
  const [fsTools, memoryTools, integrationTools, executionTools, docTools, mediaTools, routineTools] =
    await Promise.all([
      buildFilesystemTools(),
      buildMemoryTools(),
      buildIntegrationTools(userContext),
      buildExecutionTools(),
      buildDocumentReaderTools(),
      // Sub-agents can analyze/process media too; outputs land in the parent
      // conversation's session sandbox (conversationId is always present for
      // spawned agents).
      conversationId != null
        ? Promise.resolve(buildMediaTools(conversationId))
        : Promise.resolve({} as Record<string, unknown>),
      buildRoutinesTools(conversationId),
    ]);

  // Normalise every tool to ensure inputSchema is present (SDK v7
  // nested streamText contexts require it). Some tools in the codebase
  // use `parameters` instead of `inputSchema` — this adds the missing
  // property so the SDK can always find it.
  const allTools = {
    ...fsTools,
    ...memoryTools,
    ...integrationTools,
    ...executionTools,
    ...docTools,
    ...mediaTools,
    ...routineTools,
    delay: delayTool,
    web_fetch: webFetchTool,
  };

  return Object.fromEntries(
    Object.entries(allTools).map(([name, tool]) => [name, normaliseTool(tool)]),
  );
}

// ---------------------------------------------------------------------------
// Run an agent — shared by both blocking and background modes
// Task record MUST already exist before calling this so child agents can
// reference this task as their parent (for agent chaining).
// ---------------------------------------------------------------------------

async function runAgent(
  model: LanguageModel,
  agentType: string,
  task: string,
  systemPromptOverride: string | undefined,
  taskRecordId: number,
  chainContext: ChainContext | null,
  runId?: number,
): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const profile = AGENT_PROFILES[agentType];
  if (!profile) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }

  const systemPrompt =
    agentType === "custom" && systemPromptOverride
      ? systemPromptOverride
      : profile.systemPrompt;

  // Build tools for the sub-agent (pass user context so search is localized
  // and the conversation id so media outputs land in the right sandbox)
  const agentTools = await buildAgentTools(
    chainContext?.userContext,
    chainContext?.conversationId,
  );

  // Add spawn_agent and get_agent_result for agent chaining.
  // Only allow spawning if we are NOT at the max chain depth.
  if (chainContext && chainContext.chainDepth < MAX_CHAIN_DEPTH) {
    const childChainContext: ChainContext = {
      ...chainContext,
      parentTaskId: taskRecordId,
      chainDepth: chainContext.chainDepth + 1,
    };
    agentTools.spawn_agent = buildSpawnAgentTool(childChainContext);
    agentTools.get_agent_result = buildGetAgentResultTool();
  }

  // Give sub-agents access to the conversation's todo list (update & view only,
  // not init — they shouldn't wipe the main AI's plan).
  if (chainContext) {
    const { todos_update, todos_view } = buildTodoTools(chainContext.conversationId);
    agentTools.todos_update = todos_update;
    agentTools.todos_view = todos_view;
  }

  // Use streamText so we can write real-time progress to the DB.
  // The calling AI can use get_agent_result to check progress while
  // blocking mode waits for the final result.
  const stream = streamText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: task }],
    // Mark the last tool with an Anthropic cache_control breakpoint so the
    // full tool-definitions prefix is cached across steps (sub-agent system
    // prompts are short, so only the tools are worth caching here).
    tools: markLastToolForCache(chainContext?.provider, agentTools) as ToolSet,
    // Retry retryable provider failures up to 3 times before erroring out.
    maxRetries: 3,
  });

  let accumulatedText = "";
  let lastProgressUpdate = 0;

  for await (const chunk of stream.textStream) {
    accumulatedText += chunk;
    const now = Date.now();
    // Throttle progress updates to every ~300ms to avoid excessive DB writes
    if (now - lastProgressUpdate > 300) {
      await updateAgentProgress(taskRecordId, accumulatedText, runId);
      lastProgressUpdate = now;
    }
  }

  // Final progress update
  await updateAgentProgress(taskRecordId, accumulatedText, runId);

  // Read usage from the stream (textStream is already consumed above,
  // so we use accumulatedText instead of stream.text which returns empty)
  const usage = await stream.usage;

  // Use provider's usage if available, otherwise estimate
  const providerInputTokens = usage?.inputTokens ?? 0;
  const providerOutputTokens = usage?.outputTokens ?? 0;

  const estimatedInput =
    providerInputTokens > 0
      ? providerInputTokens
      : estimateTokenCount(systemPrompt) + estimateTokenCount(task);

  const estimatedOutput =
    providerOutputTokens > 0
      ? providerOutputTokens
      : estimateTokenCount(accumulatedText);

  return {
    text: accumulatedText,
    inputTokens: estimatedInput,
    outputTokens: estimatedOutput,
  };
}

// ---------------------------------------------------------------------------
// Background agent execution — the actual runner (called by the queue)
// ---------------------------------------------------------------------------

async function executeAgentExecution(
  providerId: number,
  modelId: string,
  agentType: string,
  task: string,
  taskId: number,
  chainDepth: number,
  systemPromptOverride?: string,
  userContext?: UserContext,
  runId?: number,
): Promise<void> {
  try {
    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId))
      .get();

    if (!provider) {
      await db
        .update(agentTasks)
        .set({
          status: "failed",
          error: "Provider not found",
          completedAt: new Date().toISOString(),
        })
        .where(eq(agentTasks.id, taskId));
      if (runId) {
        await finishAutomationRun(runId, { status: "failed", error: "Provider not found" });
      }
      return;
    }

    // Fetch the task record to get conversationId and parentTaskId for chaining
    const taskRecord = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, taskId))
      .get();

    if (!taskRecord) {
      return;
    }
    if (runId) {
      const durableRun = await getAutomationRun(runId);
      if (durableRun?.control === "stop" || durableRun?.status === "cancelled") {
        await db.update(agentTasks).set({ status: "failed", error: "Cancelled by user", completedAt: new Date().toISOString() }).where(eq(agentTasks.id, taskId)).run();
        return;
      }
      await startAutomationRun(runId);
    }

    const model = getLanguageModel(provider, modelId);

    // Build chain context so this agent can spawn sub-agents
    const chainContext: ChainContext = {
      provider: provider as ProviderRow,
      modelId,
      conversationId: taskRecord.conversationId,
      parentTaskId: taskId,
      chainDepth,
      userContext,
    };

    const result = await runAgent(
      model,
      agentType,
      task,
      systemPromptOverride,
      taskId,
      chainContext,
      runId,
    );

    // Update the conversation's token usage
    await db
      .update(conversations)
      .set({
        totalInputTokens: sql`total_input_tokens + ${result.inputTokens}`,
        totalOutputTokens: sql`total_output_tokens + ${result.outputTokens}`,
      })
      .where(eq(conversations.id, taskRecord.conversationId));

    await db
      .update(agentTasks)
      .set({
        status: "completed",
        result: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        completedAt: new Date().toISOString(),
      })
      .where(eq(agentTasks.id, taskId));
    if (runId) {
      await finishAutomationRun(runId, {
        status: "completed",
        result: result.text,
        checkpoint: { phase: "completed", taskId },
      });
    }
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error in background agent";
    const canRetry = runId ? await scheduleAutomationRetry(runId, errorMessage) : false;
    if (canRetry && runId) {
      await db.update(agentTasks).set({ status: "queued", error: errorMessage }).where(eq(agentTasks.id, taskId));
      const retryRun = await getAutomationRun(runId);
      setTimeout(() => {
        agentQueue.enqueue({
          providerId,
          modelId,
          agentType,
          task,
          taskId,
          runId,
          chainDepth,
          systemPromptOverride,
          userContext,
        });
      }, retryRun?.nextRetryAt ? Math.max(0, new Date(retryRun.nextRetryAt).getTime() - Date.now()) : 2_000);
      return;
    }
    await db
      .update(agentTasks)
      .set({
        status: "failed",
        error: errorMessage,
        completedAt: new Date().toISOString(),
      })
      .where(eq(agentTasks.id, taskId));
    if (runId) {
      await finishAutomationRun(runId, {
        status: "failed",
        error: errorMessage,
        checkpoint: { phase: "failed", taskId },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Create an agent task record in the DB (always before running the agent)
// ---------------------------------------------------------------------------

async function createTaskRecord(
  conversationId: number,
  agentType: string,
  task: string,
  systemPromptOverride: string | null,
  chainContext: ChainContext | null,
  initialStatus: "queued" | "running" = "running",
): Promise<{ taskId: number; runId: number }> {
  const record = await db
    .insert(agentTasks)
    .values({
      conversationId,
      parentTaskId: chainContext?.parentTaskId ?? null,
      chainDepth: chainContext?.chainDepth ?? 0,
      agentType: agentType as AgentType,
      task,
      systemPromptOverride: systemPromptOverride ?? null,
      status: initialStatus,
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();

  if (!record) {
    throw new Error("Failed to create agent task record");
  }

  const run = await createAutomationRun({
    conversationId,
    kind: "agent",
    sourceId: record.id,
    parentRunId: null,
    name: `Agent: ${getAgentLabel(agentType)}`,
    task,
  });
  await db.update(agentTasks)
    .set({ automationRunId: run.id })
    .where(eq(agentTasks.id, record.id)).run();
  return { taskId: record.id, runId: run.id };
}

// ---------------------------------------------------------------------------
// Write live progress to the agent task record (for streaming visibility)
// ---------------------------------------------------------------------------

async function updateAgentProgress(
  taskId: number,
  progress: string,
  runId?: number,
): Promise<void> {
  try {
    await db
      .update(agentTasks)
      .set({ progress })
      .where(eq(agentTasks.id, taskId))
      .run();
    if (runId) {
      await updateAutomationRunCheckpoint(runId, {
        phase: "executing",
        taskId,
        progress: progress.slice(-1_000),
      });
    }
  } catch {
    // Best-effort — progress is non-critical
  }
}

// ---------------------------------------------------------------------------
// Update the task record with completion / failure results
// ---------------------------------------------------------------------------

async function completeTaskRecord(
  taskId: number,
  status: "completed" | "failed",
  result?: string,
  error?: string,
  inputTokens?: number,
  outputTokens?: number,
): Promise<void> {
  await db
    .update(agentTasks)
    .set({
      status,
      result: result ?? null,
      progress: null, // clear progress now that we have the final result
      error: error ?? null,
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
      completedAt: new Date().toISOString(),
    })
    .where(eq(agentTasks.id, taskId))
    .run();
}

// ---------------------------------------------------------------------------
// Helper: parse agent type and get label
// ---------------------------------------------------------------------------

function getAgentLabel(agentType: string): string {
  return AGENT_PROFILES[agentType as keyof typeof AGENT_PROFILES]?.label ?? agentType;
}

// ---------------------------------------------------------------------------
// Builder: spawn_agent tool
// ---------------------------------------------------------------------------

type ProviderRow = typeof providers.$inferSelect;

export function buildSpawnAgentTool(chainContext: ChainContext | null = null) {
  const context = chainContext;
  const hasContext = context !== null;

  // Determine the actual values for the context
  // If no chainContext, these must be injected via the outer scope (the chat route)
  // But we need provider, modelId, conversationId always — so we use a fallback
  // that will be patched by runAgent for sub-agents.
  return {
    description: `Spawn a sub-agent to handle a task independently (deep research, data analysis, code writing, summarization) while you continue.

## Agent types
- **researcher** — researches topics and returns a concise summary with sources.
- **coder** — writes/analyzes/debugs/refactors code.
- **analyst** — analyzes data and provides actionable insights.
- **summarizer** — condenses long content into a concise summary.
- **custom** — agent with a system prompt you define via system_prompt_override.

## Execution modes
- **wait_for_completion: true** (default) — blocks until the agent finishes and returns the result.
- **wait_for_completion: false** — starts in the background and returns a task_id; check later with get_agent_result.

Sub-agents can spawn their own agents up to a chain depth of ${MAX_CHAIN_DEPTH}. Use sub-agents to offload heavy work and avoid token bloat — get just the summary.`,

    inputSchema: z.object({
      agent_type: z
        .enum(["researcher", "coder", "analyst", "summarizer", "custom"])
        .describe("The type of agent to spawn (each has a specialised prompt/toolset)"),
      task: z
        .string()
        .min(1)
        .max(10_000)
        .describe("The specific task for the agent. Be clear about what to do and the expected output format."),
      system_prompt_override: z
        .string()
        .max(5_000)
        .optional()
        .describe("Custom system prompt for the 'custom' agent type; ignored otherwise"),
      wait_for_completion: z
        .boolean()
        .default(true)
        .describe("true (default): wait and return the result. false: start in background and return a task_id to poll with get_agent_result."),
    }),

    execute: async ({
      agent_type,
      task,
      system_prompt_override,
      wait_for_completion,
    }: {
      agent_type: string;
      task: string;
      system_prompt_override?: string;
      wait_for_completion?: boolean;
    }) => {
      const wait = wait_for_completion ?? true;
      const typeLabel = getAgentLabel(agent_type);

      // ── Resolve context (may come from chainContext or be provided directly) ──
      // For the main AI (no chainContext), we need provider/model/conversationId
      // from the outer scope. For sub-agents, they come via chainContext.
      const resolvedProvider = hasContext
        ? (await db.select().from(providers).where(eq(providers.id, context.provider.id)).get())
        : null;

      if (hasContext && !resolvedProvider) {
        return truncateToolResult({
          type: "agent_error",
          status: "failed",
          agent_type,
          error: "Provider not found for sub-agent chain.",
        });
      }

      // For the main AI (no chainContext), these must be populated when the tool
      // is built in the chat route. We use a fallback error.
      if (!hasContext) {
        return truncateToolResult({
          type: "agent_error",
          status: "failed",
          agent_type,
          error: "spawn_agent tool was built without chain context. This is an internal error.",
        });
      }

      const convId = context.conversationId;
      const modelId = context.modelId;
      const providerRow = resolvedProvider!;
      const childChainDepth = context.chainDepth + 1;

      let taskId: number | undefined;

      try {
        // ── Create task record first (so children can reference it) ──
        // Background tasks start as "queued" and are picked up by the AgentQueue.
        // Blocking tasks start as "running" immediately.
        const taskRecord = await createTaskRecord(
          convId,
          agent_type,
          task,
          system_prompt_override ?? null,
          context,
          wait ? "running" : "queued",
        );
        taskId = taskRecord.taskId;
        const runId = taskRecord.runId;

        // Build child chain context for the new agent
        const childChainContext: ChainContext = {
          provider: providerRow as ProviderRow,
          modelId,
          conversationId: convId,
          parentTaskId: taskId,
          chainDepth: childChainDepth,
        };

        if (!wait) {
          // ── Background mode — enqueue for rate-limited execution ──
          agentQueue.enqueue({
            providerId: providerRow.id,
            modelId,
            agentType: agent_type,
            task,
            taskId,
            runId,
            chainDepth: childChainDepth,
            systemPromptOverride: system_prompt_override,
            userContext: context.userContext,
          });

          const queueLen = agentQueue.queueLength;
          const activeCount = agentQueue.activeCountValue;
          const queueNote =
            queueLen > 0
              ? ` It is #${queueLen} in the queue with ${activeCount} currently running.`
              : "";

          return truncateToolResult({
            type: "agent_spawn",
            status: "background",
            task_id: taskId,
            agent_type,
            agent_label: typeLabel,
            chain_depth: childChainDepth,
            queue_position: queueLen,
            message: `Started a ${typeLabel.toLowerCase()} agent in the background (task #${taskId}, depth ${childChainDepth}).${queueNote} Use get_agent_result with task_id: ${taskId} to retrieve its result.`,
          });
        }

        // ── Blocking mode ──
        const model = getLanguageModel(
          providerRow,
          modelId,
        );

        const result = await runAgent(
          model,
          agent_type,
          task,
          system_prompt_override,
          taskId,
          childChainContext,
          runId,
        );

        // Track the sub-agent's token usage on the conversation
        await db
          .update(conversations)
          .set({
            totalInputTokens:
              sql`total_input_tokens + ${result.inputTokens}`,
            totalOutputTokens:
              sql`total_output_tokens + ${result.outputTokens}`,
          })
          .where(eq(conversations.id, convId));

        // Mark task as completed
        await finishAutomationRun(runId, {
          status: "completed",
          result: result.text,
          checkpoint: { phase: "completed", taskId },
        });

        await completeTaskRecord(
          taskId,
          "completed",
          result.text,
          undefined,
          result.inputTokens,
          result.outputTokens,
        );

        return truncateToolResult({
          type: "agent_result",
          status: "completed",
          agent_type,
          agent_label: typeLabel,
          chain_depth: childChainDepth,
          result: result.text,
          usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          },
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);

        // Mark task as failed (if it was created)
        try {
          // We may not have taskId if creation failed
          const existing = taskId
            ? await db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get()
            : null;
          if (existing && (existing.status === "running" || existing.status === "queued")) {
            await completeTaskRecord(taskId!, "failed", undefined, errorMessage);
          }
        } catch {
          // Best-effort cleanup
        }

        return truncateToolResult({
          type: "agent_error",
          status: "failed",
          agent_type,
          error: errorMessage,
          hint: "The agent failed to complete. You can try again with a simpler task or a different agent type.",
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience: build the main tool chain (for the chat route)
// ---------------------------------------------------------------------------

export function buildMainSpawnAgentTool(
  provider: ProviderRow,
  modelId: string,
  conversationId: number,
  userContext?: UserContext,
) {
  const chainContext: ChainContext = {
    provider,
    modelId,
    conversationId,
    parentTaskId: null,
    chainDepth: 0,
    userContext,
  };
  return buildSpawnAgentTool(chainContext);
}

// ---------------------------------------------------------------------------
// Builder: get_agent_result tool — check on a background agent
// ---------------------------------------------------------------------------

export async function retryAgentTask(taskId: number, runId: number): Promise<void> {
  const task = await db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) throw new Error("Agent task no longer exists.");
  const conversation = await db.select().from(conversations).where(eq(conversations.id, task.conversationId)).get();
  if (!conversation?.providerId || !conversation.modelId) throw new Error("Conversation has no configured model.");
  const selectedProvider = await db.select().from(providers).where(eq(providers.id, conversation.providerId)).get();
  if (!selectedProvider) throw new Error("Provider no longer exists.");
  await db.update(agentTasks).set({ status: "queued", error: null, completedAt: null }).where(eq(agentTasks.id, taskId)).run();
  agentQueue.enqueue({
    providerId: selectedProvider.id,
    modelId: conversation.modelId,
    agentType: task.agentType,
    task: task.task,
    taskId,
    runId,
    chainDepth: task.chainDepth,
    systemPromptOverride: task.systemPromptOverride ?? undefined,
  });
}

export function buildGetAgentResultTool() {
  return {
    description: `Check the result of a background agent started with spawn_agent (wait_for_completion: false). Returns the current status: running, completed, or failed. Once completed, the result field contains the agent's full output.`,

    inputSchema: z.object({
      task_id: z
        .number()
        .int()
        .positive()
        .describe("The task ID returned by spawn_agent when starting a background agent"),
    }),

    execute: async ({ task_id }: { task_id: number }) => {
      try {
        const task = await db
          .select()
          .from(agentTasks)
          .where(eq(agentTasks.id, task_id))
          .get();

        if (!task) {
          return truncateToolResult({
            type: "agent_status",
            status: "not_found",
            task_id,
            error: `No agent task found with ID ${task_id}.`,
          });
        }

        const typeLabel = getAgentLabel(task.agentType);

        const baseFields = {
          task_id: task.id,
          agent_type: task.agentType,
          agent_label: typeLabel,
          chain_depth: task.chainDepth,
          parent_task_id: task.parentTaskId,
          created_at: task.createdAt,
        };

        if (task.status === "queued") {
          return truncateToolResult({
            type: "agent_status",
            status: "queued",
            ...baseFields,
            message: `The ${typeLabel.toLowerCase()} agent (task #${task_id}, depth ${task.chainDepth}) is queued and waiting to run. Check again later with get_agent_result.`,
          });
        }

        if (task.status === "running") {
          return truncateToolResult({
            type: "agent_status",
            status: "running",
            ...baseFields,
            progress: task.progress ?? "",
            message: `The ${typeLabel.toLowerCase()} agent (task #${task_id}, depth ${task.chainDepth}) is still working. Use progress to see what it's doing. Check again later for updates.`,
          });
        }

        if (task.status === "failed") {
          return truncateToolResult({
            type: "agent_status",
            status: "failed",
            ...baseFields,
            progress: task.progress ?? "",
            error: task.error ?? "Unknown error",
            completed_at: task.completedAt,
          });
        }

        // Completed
        return truncateToolResult({
          type: "agent_status",
          status: "completed",
          ...baseFields,
          result: task.result ?? "",
          usage: {
            inputTokens: task.inputTokens,
            outputTokens: task.outputTokens,
          },
          completed_at: task.completedAt,
        });
      } catch (err) {
        return truncateToolResult({
          type: "agent_status",
          status: "error",
          task_id,
          error: `Failed to check agent result: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
  };
}
