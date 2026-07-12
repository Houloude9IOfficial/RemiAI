ALTER TABLE `conversations` ADD `total_input_tokens` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `conversations` ADD `total_output_tokens` integer DEFAULT 0 NOT NULL;
