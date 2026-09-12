ALTER TABLE `memories` ADD `category` text DEFAULT 'general' NOT NULL;
--> statement-breakpoint
ALTER TABLE `memories` ADD `memory_date` text;
--> statement-breakpoint
UPDATE `memories` SET `category` = 'general' WHERE `category` IS NULL OR `category` = '';
