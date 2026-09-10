ALTER TABLE `user_preferences` ADD `remi_api_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `remi_api_enabled` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `card_display_modes` text DEFAULT '{}' NOT NULL;
