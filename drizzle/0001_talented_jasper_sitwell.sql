CREATE TABLE `earning_rules` (
	`doctor_id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`value` integer NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `earnings` (
	`case_id` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`gross` integer NOT NULL,
	`amount` integer,
	`mode` text NOT NULL,
	`value` integer,
	`earned_at` text NOT NULL,
	`allocated_at` text,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `earnings_doctor_date` ON `earnings` (`doctor_id`,`earned_at`);