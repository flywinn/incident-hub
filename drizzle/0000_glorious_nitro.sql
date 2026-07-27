CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`before_value` text,
	`after_value` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `bug_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bug_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`actor` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bug_events_bug_idx` ON `bug_events` (`bug_id`);--> statement-breakpoint
CREATE INDEX `bug_events_created_idx` ON `bug_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `bugs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bug_code` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`service_id` integer,
	`service_label` text NOT NULL,
	`priority` text DEFAULT 'P3' NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`owner_id` integer,
	`owner_name` text DEFAULT 'تعیین نشده' NOT NULL,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`external_alert_id` text,
	`fingerprint` text,
	`dashboard_url` text,
	`occurrence_count` integer DEFAULT 1 NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`next_follow_up_at` text,
	`resolved_at` text,
	`closed_at` text,
	`created_by` text DEFAULT 'سامانه' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bugs_bug_code_uq` ON `bugs` (`bug_code`);--> statement-breakpoint
CREATE INDEX `bugs_status_idx` ON `bugs` (`status`);--> statement-breakpoint
CREATE INDEX `bugs_priority_idx` ON `bugs` (`priority`);--> statement-breakpoint
CREATE INDEX `bugs_fingerprint_idx` ON `bugs` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `bugs_next_follow_up_idx` ON `bugs` (`next_follow_up_at`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bug_id` integer NOT NULL,
	`body` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_bug_idx` ON `comments` (`bug_id`);--> statement-breakpoint
CREATE TABLE `daily_counters` (
	`day` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bug_id` integer,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`template` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `email_queue_status_idx` ON `email_queue` (`status`);--> statement-breakpoint
CREATE TABLE `follow_ups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bug_id` integer NOT NULL,
	`type` text DEFAULT 'بررسی فنی' NOT NULL,
	`scheduled_at` text NOT NULL,
	`completed_at` text,
	`owner_name` text NOT NULL,
	`status` text DEFAULT 'SCHEDULED' NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `follow_ups_bug_idx` ON `follow_ups` (`bug_id`);--> statement-breakpoint
CREATE INDEX `follow_ups_schedule_idx` ON `follow_ups` (`scheduled_at`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`path` text NOT NULL,
	`team` text NOT NULL,
	`manager_email` text DEFAULT '' NOT NULL,
	`alert_email` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_code_uq` ON `services` (`code`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_code_uq` ON `teams` (`code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'OPERATOR' NOT NULL,
	`team` text DEFAULT 'عملیات' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);