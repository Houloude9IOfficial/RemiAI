ALTER TABLE `sources` ADD `published_at` text;
--> statement-breakpoint
ALTER TABLE `sources` ADD `quality_score` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `sources` ADD `freshness_status` text DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint
CREATE TABLE `source_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`source_run_id` text,
	`claim_text` text NOT NULL,
	`source_ids` text DEFAULT '[]' NOT NULL,
	`support_status` text DEFAULT 'unsupported' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_claims_conversation_id_created_at_idx` ON `source_claims` (`conversation_id`,`created_at`);
