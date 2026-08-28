import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const directories = sqliteTable("directories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  label: text("label").notNull(),
  canRead: integer("can_read", { mode: "boolean" }).notNull().default(true),
  canWrite: integer("can_write", { mode: "boolean" }).notNull().default(false),
  watchEnabled: integer("watch_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const providers = sqliteTable("providers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", {
    enum: [
      "anthropic",
      "openai",
      "ollama",
      "openai-compatible",
      "google",
      "mistral",
      "groq",
      "openrouter",
    ],
  }).notNull(),
  isPreset: integer("is_preset", { mode: "boolean" }).notNull(),
  label: text("label").notNull(),
  baseUrl: text("base_url"),
  apiKey: text("api_key"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const providerModels = sqliteTable(
  "provider_models",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    label: text("label"),
    // Context-window size reported by the provider's models API (real source
    // of truth, e.g. Anthropic `context_window`, Google `inputTokenLimit`,
    // Mistral `max_context_length`, Groq/OpenRouter `context_length`). Null
    // when the provider doesn't publish it — the UI falls back to the
    // hardcoded {@link MODEL_CONTEXT_WINDOWS} heuristics.
    contextWindow: integer("context_window"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [unique().on(t.providerId, t.modelId)],
);

export const mcpServers = sqliteTable("mcp_servers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  transport: text("transport", { enum: ["stdio", "http"] }).notNull(),
  command: text("command"),
  args: text("args", { mode: "json" }).$type<string[]>(),
  env: text("env", { mode: "json" }).$type<Record<string, string>>(),
  url: text("url"),
  headers: text("headers", { mode: "json" }).$type<Record<string, string>>(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastConnectedAt: text("last_connected_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const memories = sqliteTable("memories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const userPreferences = sqliteTable("user_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  preferredName: text("preferred_name").notNull().default(""),
  preferences: text("preferences").notNull().default(""),
  personality: text("personality").notNull().default("Be helpful, concise, and direct. Match the user\'s tone."),
  avatarUrl: text("avatar_url").notNull().default(""),
  bio: text("bio").notNull().default(""),
  location: text("location").notNull().default(""),
  occupation: text("occupation").notNull().default(""),
  interests: text("interests").notNull().default(""),
  skills: text("skills").notNull().default(""),
  pronouns: text("pronouns").notNull().default(""),
  birthday: text("birthday").notNull().default(""),
  links: text("links", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  accentColor: text("accent_color").notNull().default(""),
  backgroundColor: text("background_color").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull().default("New chat"),
  providerId: integer("provider_id").references(() => providers.id, {
    onDelete: "set null",
  }),
  modelId: text("model_id"),
  mode: text("mode", { enum: ["chat", "goal", "plan", "build"] }).notNull().default("chat"),
  qualityPolicy: text("quality_policy", {
    enum: ["fast", "balanced", "quality", "selected"],
  })
    .notNull()
    .default("balanced"),
  bashMode: text("bash_mode", { enum: ["sandboxed", "full"] })
    .notNull()
    .default("sandboxed"),
  totalInputTokens: integer("total_input_tokens").notNull().default(0),
  totalOutputTokens: integer("total_output_tokens").notNull().default(0),
  // Rolling-conversation summary: a compact prose recap of the EARLIEST part
  // of the conversation, generated in the background. Requests inject it into
  // the system prompt and drop the summarized messages from the model payload
  // (they still exist in the `messages` table for the UI and future edits).
  summary: text("summary").notNull().default(""),
  // Number of leading messages (by orderIndex) the summary covers.
  summaryMessageCount: integer("summary_message_count").notNull().default(0),
  // Active dynamic-tool-loading groups. `explicit` = groups enabled via the
  // load_tool_groups tool (persistent); `recent` = the last request's own
  // classifier+recency signal (self-decaying). Lets short follow-ups inherit
  // the tools the conversation was just using.
  toolGroups: text("tool_groups", { mode: "json" })
    .$type<{ explicit: string[]; recent: string[] }>()
    .notNull()
    .default({ explicit: [], recent: [] }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const toolConfigs = sqliteTable("tool_configs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolId: text("tool_id").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  apiKey: text("api_key"),
  config: text("config", { mode: "json" }).$type<Record<string, string>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const buildRuns = sqliteTable(
  "build_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sourceRunId: text("source_run_id"),
    task: text("task").notNull(),
    status: text("status", {
      enum: ["running", "completed", "failed", "interrupted"],
    })
      .notNull()
      .default("running"),
    definitionOfDone: text("definition_of_done", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    changedFiles: text("changed_files", { mode: "json" })
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    checks: text("checks", { mode: "json" })
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    checkpoint: text("checkpoint", { mode: "json" })
      .$type<Record<string, unknown> | null>(),
    resultArtifactId: integer("result_artifact_id"),
    summary: text("summary").notNull().default(""),
    error: text("error"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
  },
);

export const artifacts = sqliteTable(
  "artifacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** Trace/run identifier that produced this output. */
    sourceRunId: text("source_run_id"),
    type: text("type", {
      enum: ["file", "visual", "document", "chart", "research", "code", "other"],
    })
      .notNull()
      .default("file"),
    title: text("title").notNull(),
    /** Legacy artifact path retained for compatibility with older databases. */
    legacyPath: text("path").notNull().default(""),
    status: text("status", {
      enum: ["completed", "partial", "failed"],
    })
      .notNull()
      .default("completed"),
    /** Relative path in the conversation's session sandbox, when applicable. */
    sessionPath: text("session_path"),
    fileSize: integer("file_size").notNull().default(0),
    version: integer("version").notNull().default(1),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

export const sources = sqliteTable(
  "sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sourceRunId: text("source_run_id"),
    toolName: text("tool_name").notNull(),
    sourceType: text("source_type", {
      enum: ["web", "news", "local", "other"],
    })
      .notNull()
      .default("web"),
    url: text("url").notNull(),
    title: text("title").notNull(),
    publisher: text("publisher").notNull().default(""),
    retrievedAt: text("retrieved_at").notNull(),
    contentHash: text("content_hash").notNull().default(""),
    publishedAt: text("published_at"),
    qualityScore: integer("quality_score").notNull().default(0),
    freshnessStatus: text("freshness_status", {
      enum: ["fresh", "stale", "unknown"],
    })
      .notNull()
      .default("unknown"),
    extractionStatus: text("extraction_status", {
      enum: ["complete", "partial", "failed", "unavailable"],
    })
      .notNull()
      .default("unavailable"),
    status: text("status", {
      enum: ["available", "partial", "failed"],
    })
      .notNull()
      .default("partial"),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

export const sourceClaims = sqliteTable(
  "source_claims",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sourceRunId: text("source_run_id"),
    claimText: text("claim_text").notNull(),
    sourceIds: text("source_ids", { mode: "json" })
      .$type<number[]>()
      .notNull()
      .default([]),
    supportStatus: text("support_status", {
      enum: ["supported", "partial", "unsupported", "disputed", "inference"],
    })
      .notNull()
      .default("unsupported"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uiId: text("ui_id").notNull(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    parts: text("parts", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    orderIndex: integer("order_index").notNull(),
  },
  (t) => [unique().on(t.conversationId, t.uiId)],
);

export const todoItems = sqliteTable(
  "todo_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    task: text("task").notNull(),
    status: text("status", {
      enum: ["pending", "in_progress", "completed", "failed", "skipped"],
    })
      .notNull()
      .default("pending"),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [unique().on(t.conversationId, t.itemId)],
);

export const fileIndex = sqliteTable(
  "file_index",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    directoryId: integer("directory_id")
      .notNull()
      .references(() => directories.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull(),
    fileSize: integer("file_size").notNull().default(0),
    modifiedAt: integer("modified_at").notNull().default(0),
    contentHash: text("content_hash").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [unique().on(t.directoryId, t.relativePath)],
);

export const automationRuns = sqliteTable("automation_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  kind: text("kind", {
    enum: ["routine", "scheduled_task", "webhook", "agent"],
  }).notNull(),
  sourceId: integer("source_id"),
  parentRunId: integer("parent_run_id"),
  name: text("name").notNull(),
  task: text("task").notNull(),
  status: text("status", {
    enum: [
      "queued",
      "planning",
      "executing",
      "verifying",
      "repairing",
      "waiting",
      "completed",
      "partially_completed",
      "failed",
      "cancelled",
    ],
  }).notNull().default("queued"),
  attempt: integer("attempt").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(2),
  checkpoint: text("checkpoint", { mode: "json" })
    .$type<Record<string, unknown> | null>(),
  result: text("result"),
  error: text("error"),
  control: text("control", {
    enum: ["none", "stop", "retry", "steer"],
  }).notNull().default("none"),
  controlMessage: text("control_message"),
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  startedAt: text("started_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
  nextRetryAt: text("next_retry_at"),
});

export const automationRunEvents = sqliteTable("automation_run_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id")
    .notNull()
    .references(() => automationRuns.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  message: text("message").notNull().default(""),
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const routines = sqliteTable("routines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  code: text("code").notNull(),
  schedule: text("schedule"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastScheduledRun: text("last_scheduled_run"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const routineLogs = sqliteTable("routine_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  automationRunId: integer("automation_run_id").references(() => automationRuns.id, {
    onDelete: "set null",
  }),
  routineId: integer("routine_id")
    .notNull()
    .references(() => routines.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull(),
  output: text("output"),
  error: text("error"),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const scheduledTasks = sqliteTable("scheduled_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  automationRunId: integer("automation_run_id").references(() => automationRuns.id, {
    onDelete: "set null",
  }),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  triggerAt: text("trigger_at").notNull(),
  task: text("task").notNull(),
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed", "cancelled"],
  })
    .notNull()
    .default("pending"),
  schedule: text("schedule"), // cron expression for recurring tasks
  lastRunAt: text("last_run_at"), // last execution time (for recurring)
  result: text("result"),
  error: text("error"),
  notificationSent: integer("notification_sent", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const backupHistory = sqliteTable("backup_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  exportedAt: text("exported_at").notNull(),
  totalSize: integer("total_size").notNull().default(0),
  includesFiles: integer("includes_files", { mode: "boolean" }).notNull().default(true),
  tableStats: text("table_stats", { mode: "json" }).$type<Record<string, number>>().notNull().default({}),
  uploadCount: integer("upload_count").notNull().default(0),
  avatarCount: integer("avatar_count").notNull().default(0),
  skillCount: integer("skill_count").notNull().default(0),
  appVersion: text("app_version").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const agentTasks = sqliteTable("agent_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  automationRunId: integer("automation_run_id").references(() => automationRuns.id, {
    onDelete: "set null",
  }),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  parentTaskId: integer("parent_task_id"),
  chainDepth: integer("chain_depth").notNull().default(0),
  agentType: text("agent_type", {
    enum: ["researcher", "coder", "analyst", "summarizer", "custom"],
  }).notNull(),
  task: text("task").notNull(),
  systemPromptOverride: text("system_prompt_override"),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed"],
  })
    .notNull()
    .default("running"),
  result: text("result"),
  progress: text("progress"),
  error: text("error"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const authAccounts = sqliteTable("auth_accounts", {
  id: integer("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  persistent: integer("persistent", { mode: "boolean" }).notNull().default(false),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const authBootstrap = sqliteTable("auth_bootstrap", {
  id: integer("id").primaryKey(),
  codeHash: text("code_hash").notNull(),
  consumedAt: text("consumed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * A structured filter condition evaluated against an incoming webhook
 * payload. All conditions on a webhook must pass (AND) for the AI run to
 * trigger; an empty list means "always trigger".
 */
export type WebhookCondition = {
  /** Dot path into the payload, e.g. "type" or "entry.0.messaging.0.message.text". */
  field: string;
  op: "eq" | "neq" | "contains" | "startsWith" | "endsWith" | "exists" | "matches";
  /** Comparison value for all ops except `exists`. */
  value?: string;
};

export const webhooks = sqliteTable("webhooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // Secret the caller must present (X-Webhook-Secret header or
  // Authorization: Bearer) for deliveries to be accepted.
  secret: text("secret").notNull(),
  // Trigger instructions given to the AI when this webhook fires.
  // Supports {{payload.path}}, {{headers.name}}, {{query.name}} substitution.
  systemPrompt: text("system_prompt").notNull().default(""),
  // Structured filter conditions (AND). Empty array = always trigger.
  conditions: text("conditions", { mode: "json" })
    .$type<WebhookCondition[]>()
    .notNull()
    .default([]),
  // Conversation the triggered AI run appears in (auto-created at setup by
  // default, or any existing chat). Null if the conversation was deleted.
  conversationId: integer("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  // If true, the delivery request waits for the AI run and returns the
  // response text to the caller (e.g. replying to a chat platform API).
  respondSync: integer("respond_sync", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastReceivedAt: text("last_received_at"),
  lastStatus: text("last_status"),
  lastEventId: integer("last_event_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const skillRepos = sqliteTable("skill_repos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Normalised `owner/repo` or full URL string — the unique external address.
  source: text("source").notNull().unique(),
  // Display name (e.g. `vercel-labs/agent-skills`).
  name: text("name").notNull(),
  isPreloaded: integer("is_preloaded", { mode: "boolean" }).notNull().default(false),
  lastCheckedAt: text("last_checked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const skills = sqliteTable(
  "skills",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repoId: integer("repo_id")
      .notNull()
      .references(() => skillRepos.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    // Relative path under DATA_DIR/skills/<repo-slug>/<skill-name>/
    diskPath: text("disk_path").notNull(),
    // The Library Active toggle: Active = listed in the chat system prompt
    // AND load_skill can load it. Inactive = hidden from the model.
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    // Hash of the installed content (files + SKILL.md) — update detection.
    contentHash: text("content_hash"),
    // Set by the background update check when upstream differs from what's
    // installed; cleared when the user applies the update.
    updateAvailable: integer("update_available", { mode: "boolean" })
      .notNull()
      .default(false),
    installedAt: text("installed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [unique().on(t.repoId, t.name)],
);

export const webhookEvents = sqliteTable("webhook_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  automationRunId: integer("automation_run_id").references(() => automationRuns.id, {
    onDelete: "set null",
  }),
  webhookId: integer("webhook_id")
    .notNull()
    .references(() => webhooks.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["received", "processing", "completed", "skipped", "failed"],
  })
    .notNull()
    .default("received"),
  payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
  result: text("result"),
  error: text("error"),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});
