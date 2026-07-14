-- Rename actions table to routines
ALTER TABLE `actions` RENAME TO `routines`;
--> statement-breakpoint
-- Rename action_logs table and migrate action_id column to routine_id
ALTER TABLE `action_logs` RENAME TO `_routine_logs_old`;
--> statement-breakpoint
CREATE TABLE `routine_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`routine_id` integer NOT NULL,
	`status` text NOT NULL,
	`output` text,
	`error` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `routine_logs` (`id`, `routine_id`, `status`, `output`, `error`, `started_at`, `completed_at`)
SELECT `id`, `action_id`, `status`, `output`, `error`, `started_at`, `completed_at` FROM `_routine_logs_old`;
--> statement-breakpoint
DROP TABLE `_routine_logs_old`;
--> statement-breakpoint
-- Update tool config reference from "actions" to "routines"
UPDATE `tool_configs` SET `tool_id` = 'routines' WHERE `tool_id` = 'actions';
