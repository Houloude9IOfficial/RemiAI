ALTER TABLE `conversations` ADD `total_input_tokens` integer DEFAULT 0 NOT NULL;
ALTER TABLE `conversations` ADD `total_output_tokens` integer DEFAULT 0 NOT NULL;
