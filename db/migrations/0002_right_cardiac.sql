DROP INDEX `messages_ui_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_conversation_id_ui_id_unique` ON `messages` (`conversation_id`,`ui_id`);