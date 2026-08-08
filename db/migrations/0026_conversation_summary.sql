ALTER TABLE `conversations` ADD `summary` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `conversations` ADD `summary_message_count` integer DEFAULT 0 NOT NULL;
