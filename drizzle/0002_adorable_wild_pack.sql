CREATE TABLE `bug_assignees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bug_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`assigned_by` text DEFAULT 'سامانه' NOT NULL,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bug_assignees_bug_user_uq` ON `bug_assignees` (`bug_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `bug_assignees_bug_idx` ON `bug_assignees` (`bug_id`);--> statement-breakpoint
CREATE INDEX `bug_assignees_user_idx` ON `bug_assignees` (`user_id`);