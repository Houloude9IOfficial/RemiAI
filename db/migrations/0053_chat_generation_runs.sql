CREATE TABLE `chat_generation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` integer NOT NULL,
	`assistant_message_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`continuation_count` integer DEFAULT 0 NOT NULL,
	`max_continuations` integer DEFAULT 3 NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_generation_runs_conversation_status_idx` ON `chat_generation_runs` (`conversation_id`,`status`);
