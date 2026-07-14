CREATE TABLE `file_index` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`directory_id` integer NOT NULL,
	`relative_path` text NOT NULL,
	`file_size` integer DEFAULT 0 NOT NULL,
	`modified_at` integer DEFAULT 0 NOT NULL,
	`content_hash` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`directory_id`) REFERENCES `directories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_index_directory_id_relative_path_unique` ON `file_index` (`directory_id`,`relative_path`);--> statement-breakpoint
ALTER TABLE `directories` ADD `watch_enabled` integer DEFAULT false NOT NULL;