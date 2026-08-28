ALTER TABLE `conversations` ADD `is_temporary` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `conversations` ADD `memory_enabled` integer DEFAULT true NOT NULL;
