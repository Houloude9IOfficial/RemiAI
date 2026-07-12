CREATE TABLE `user_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`preferred_name` text DEFAULT '' NOT NULL,
	`preferences` text DEFAULT '' NOT NULL,
	`personality` text DEFAULT 'Be helpful, concise, and direct. Match the user''s tone.' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
