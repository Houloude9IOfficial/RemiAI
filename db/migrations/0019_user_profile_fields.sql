ALTER TABLE `user_preferences` ADD `avatar_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `bio` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `location` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `occupation` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `interests` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `skills` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `pronouns` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `birthday` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `links` text DEFAULT '{}' NOT NULL;
