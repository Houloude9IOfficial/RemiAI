CREATE TABLE `build_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`source_run_id` text,
	`task` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`definition_of_done` text DEFAULT '[]' NOT NULL,
	`changed_files` text DEFAULT '[]' NOT NULL,
	`checks` text DEFAULT '[]' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `build_runs_conversation_id_created_at_idx` ON `build_runs` (`conversation_id`,`created_at`);
