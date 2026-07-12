CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text DEFAULT 'New chat' NOT NULL,
	`provider_id` integer,
	`model_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `directories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`label` text NOT NULL,
	`can_read` integer DEFAULT true NOT NULL,
	`can_write` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `directories_path_unique` ON `directories` (`path`);--> statement-breakpoint
CREATE TABLE `mcp_servers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`transport` text NOT NULL,
	`command` text,
	`args` text,
	`env` text,
	`url` text,
	`headers` text,
	`enabled` integer DEFAULT true NOT NULL,
	`last_connected_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_servers_name_unique` ON `mcp_servers` (`name`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`role` text NOT NULL,
	`parts` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`order_index` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `provider_models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` integer NOT NULL,
	`model_id` text NOT NULL,
	`label` text,
	`enabled` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_models_provider_id_model_id_unique` ON `provider_models` (`provider_id`,`model_id`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`is_preset` integer NOT NULL,
	`label` text NOT NULL,
	`base_url` text,
	`api_key` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
