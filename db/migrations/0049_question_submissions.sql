CREATE TABLE `question_submissions` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` integer NOT NULL REFERENCES `conversations`(`id`) ON DELETE cascade,
  `tool_call_id` text NOT NULL,
  `message_id` text NOT NULL,
  `text` text NOT NULL,
  `delivered` integer DEFAULT false NOT NULL,
  `auto_continue` integer DEFAULT true NOT NULL,
  FOREIGN KEY (`conversation_id`, `message_id`) REFERENCES `messages` (`conversation_id`, `ui_id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_submissions_conversation_id_tool_call_id_unique` ON `question_submissions` (`conversation_id`, `tool_call_id`);
