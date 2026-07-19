CREATE TABLE `scheduled_tasks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `conversation_id` integer NOT NULL REFERENCES `conversations`(`id`) ON DELETE CASCADE,
  `trigger_at` text NOT NULL,
  `task` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `result` text,
  `error` text,
  `notification_sent` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `completed_at` text
);
--> statement-breakpoint
CREATE INDEX `scheduled_tasks_status_idx` ON `scheduled_tasks`(`status`);
--> statement-breakpoint
CREATE INDEX `scheduled_tasks_trigger_idx` ON `scheduled_tasks`(`trigger_at`);
