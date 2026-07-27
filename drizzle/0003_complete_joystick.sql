ALTER TABLE `email_queue` ADD `cc` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `email_queue` ADD `body_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `email_queue` ADD `prepared_by` text DEFAULT 'سامانه' NOT NULL;