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
    enum: ["anthropic", "openai", "ollama", "openai-compatible"],
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
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull().default("New chat"),
  providerId: integer("provider_id").references(() => providers.id, {
    onDelete: "set null",
  }),
  modelId: text("model_id"),
  totalInputTokens: integer("total_input_tokens").notNull().default(0),
  totalOutputTokens: integer("total_output_tokens").notNull().default(0),
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
  routineId: integer("routine_id")
    .notNull()
    .references(() => routines.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull(),
  output: text("output"),
  error: text("error"),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const agentTasks = sqliteTable("agent_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
