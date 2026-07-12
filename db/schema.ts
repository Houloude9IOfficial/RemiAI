import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const directories = sqliteTable("directories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  label: text("label").notNull(),
  canRead: integer("can_read", { mode: "boolean" }).notNull().default(true),
  canWrite: integer("can_write", { mode: "boolean" }).notNull().default(false),
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
  providerId: integer("provider_id").references(() => providers.id),
  modelId: text("model_id"),
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
