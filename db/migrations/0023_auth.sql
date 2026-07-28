CREATE TABLE `auth_accounts` (
  `id` integer PRIMARY KEY NOT NULL,
  `email` text NOT NULL UNIQUE,
  `display_name` text DEFAULT '' NOT NULL,
  `password_hash` text NOT NULL,
  `password_salt` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `expires_at` text NOT NULL,
  `persistent` integer DEFAULT 0 NOT NULL,
  `revoked_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_bootstrap` (
  `id` integer PRIMARY KEY NOT NULL,
  `code_hash` text NOT NULL,
  `consumed_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
