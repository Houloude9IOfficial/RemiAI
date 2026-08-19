CREATE TABLE `automation_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `conversation_id` integer NOT NULL REFERENCES `conversations`(`id`) ON DELETE CASCADE,
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
CREATE INDEX `automation_runs_conversation_id_created_at_idx` ON `automation_runs` (`conversation_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `automation_runs_status_next_retry_at_idx` ON `automation_runs` (`status`,`next_retry_at`);
--> statement-breakpoint
CREATE TABLE `automation_run_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL REFERENCES `automation_runs`(`id`) ON DELETE CASCADE,
  `event_type` text NOT NULL,
  `message` text DEFAULT '' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `automation_run_events_run_id_created_at_idx` ON `automation_run_events` (`run_id`,`created_at`);
--> statement-breakpoint
ALTER TABLE `routine_logs` ADD `automation_run_id` integer REFERENCES `automation_runs`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `scheduled_tasks` ADD `automation_run_id` integer REFERENCES `automation_runs`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `agent_tasks` ADD `automation_run_id` integer REFERENCES `automation_runs`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `webhook_events` ADD `automation_run_id` integer REFERENCES `automation_runs`(`id`) ON DELETE set null;
