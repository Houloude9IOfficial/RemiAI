CREATE TABLE `skill_repos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`is_preloaded` integer DEFAULT false NOT NULL,
	`last_checked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_repos_source_unique` ON `skill_repos` (`source`);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`disk_path` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`content_hash` text,
	`update_available` integer DEFAULT false NOT NULL,
	`installed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `skill_repos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_repo_id_name_unique` ON `skills` (`repo_id`, `name`);
--> statement-breakpoint
ALTER TABLE `backup_history` ADD `skill_count` integer DEFAULT 0 NOT NULL;
