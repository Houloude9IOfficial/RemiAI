CREATE TABLE `backup_history` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `exported_at` text NOT NULL,
  `total_size` integer DEFAULT 0 NOT NULL,
  `includes_files` integer DEFAULT 1 NOT NULL,
  `table_stats` text DEFAULT '{}' NOT NULL,
  `upload_count` integer DEFAULT 0 NOT NULL,
  `avatar_count` integer DEFAULT 0 NOT NULL,
  `app_version` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backup_history_exported_idx` ON `backup_history`(`exported_at`);
