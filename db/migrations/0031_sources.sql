CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`source_run_id` text,
	`tool_name` text NOT NULL,
	`source_type` text DEFAULT 'web' NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`publisher` text DEFAULT '' NOT NULL,
	`retrieved_at` text NOT NULL,
	`content_hash` text DEFAULT '' NOT NULL,
	`extraction_status` text DEFAULT 'unavailable' NOT NULL,
	`status` text DEFAULT 'partial' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sources_conversation_id_updated_at_idx` ON `sources` (`conversation_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `sources_conversation_id_url_idx` ON `sources` (`conversation_id`,`url`);
