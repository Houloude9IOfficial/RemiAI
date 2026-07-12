CREATE TABLE `tool_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tool_id` text NOT NULL UNIQUE,
	`enabled` integer DEFAULT false NOT NULL,
	`api_key` text,
	`config` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
