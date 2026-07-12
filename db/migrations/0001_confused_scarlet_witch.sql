ALTER TABLE `messages` ADD `ui_id` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_ui_id_unique` ON `messages` (`ui_id`);