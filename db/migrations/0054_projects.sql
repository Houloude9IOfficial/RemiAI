-- Older installations may already have a projects table with a different
-- shape. Startup compatibility repair adds the new columns to that table.
CREATE TABLE IF NOT EXISTS `projects` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `brief` text DEFAULT '' NOT NULL,
  `instructions` text DEFAULT '' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `pinned` integer DEFAULT false NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
