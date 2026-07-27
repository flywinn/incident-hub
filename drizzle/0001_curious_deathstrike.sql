CREATE TABLE `import_batches` (
	`batch_key` text PRIMARY KEY NOT NULL,
	`source_name` text NOT NULL,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
