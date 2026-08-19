CREATE TABLE `artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`source_run_id` text,
	`type` text DEFAULT 'file' NOT NULL,
	`title` text NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`session_path` text,
	`file_size` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artifacts_conversation_id_updated_at_idx` ON `artifacts` (`conversation_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `artifacts_conversation_id_session_path_idx` ON `artifacts` (`conversation_id`,`session_path`);
