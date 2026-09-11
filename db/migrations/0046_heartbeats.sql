PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `automation_runs_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `conversation_id` integer REFERENCES `conversations`(`id`) ON DELETE cascade,
  `heartbeat_id` integer,
  `kind` text NOT NULL,
  `source_id` integer,
  `parent_run_id` integer,
  `name` text NOT NULL,
  `task` text NOT NULL,
  `status` text DEFAULT 'queued' NOT NULL,
  `attempt` integer DEFAULT 0 NOT NULL,
  `max_attempts` integer DEFAULT 2 NOT NULL,
  `checkpoint` text,
  `result` text,
  `error` text,
  `control` text DEFAULT 'none' NOT NULL,
  `control_message` text,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `started_at` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `completed_at` text,
  `next_retry_at` text
);
--> statement-breakpoint
INSERT INTO `automation_runs_new` SELECT `id`, `conversation_id`, NULL, `kind`, `source_id`, `parent_run_id`, `name`, `task`, `status`, `attempt`, `max_attempts`, `checkpoint`, `result`, `error`, `control`, `control_message`, `metadata`, `created_at`, `started_at`, `updated_at`, `completed_at`, `next_retry_at` FROM `automation_runs`;
--> statement-breakpoint
DROP TABLE `automation_runs`;
--> statement-breakpoint
ALTER TABLE `automation_runs_new` RENAME TO `automation_runs`;
--> statement-breakpoint
CREATE INDEX `automation_runs_conversation_id_created_at_idx` ON `automation_runs` (`conversation_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `automation_runs_status_next_retry_at_idx` ON `automation_runs` (`status`,`next_retry_at`);
--> statement-breakpoint
CREATE TABLE `heartbeats` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `prompt` text NOT NULL,
  `enabled` integer DEFAULT true NOT NULL,
  `schedule_type` text DEFAULT 'interval' NOT NULL,
  `schedule` text DEFAULT '3600' NOT NULL,
  `timezone` text DEFAULT 'UTC' NOT NULL,
  `next_run_at` text NOT NULL,
  `last_run_at` text,
  `provider_id` integer REFERENCES `providers`(`id`) ON DELETE set null,
  `model_id` text,
  `allowed_tool_names` text DEFAULT '[]' NOT NULL,
  `allowed_tool_groups` text DEFAULT '[]' NOT NULL,
  `allowed_mcp_server_ids` text DEFAULT '[]' NOT NULL,
  `max_steps` integer DEFAULT 20 NOT NULL,
  `timeout_seconds` integer DEFAULT 300 NOT NULL,
  `max_attempts` integer DEFAULT 2 NOT NULL,
  `retention_days` integer DEFAULT 30 NOT NULL,
  `notify_on_completion` integer DEFAULT false NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `heartbeat_tool_calls` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL REFERENCES `automation_runs`(`id`) ON DELETE cascade,
  `call_id` text,
  `tool_name` text NOT NULL,
  `input` text,
  `output` text,
  `status` text NOT NULL,
  `started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `completed_at` text,
  `duration_ms` integer
);
--> statement-breakpoint
CREATE INDEX `heartbeat_tool_calls_run_id_idx` ON `heartbeat_tool_calls` (`run_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
