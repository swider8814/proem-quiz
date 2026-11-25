CREATE TABLE `quiz_folder_items` (
	`user_id` text NOT NULL,
	`quiz_id` text NOT NULL,
	`folder_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `quiz_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `quiz_folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quiz_folder_items_folder_idx` ON `quiz_folder_items` (`folder_id`);--> statement-breakpoint
CREATE TABLE `quiz_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quiz_folders_user_idx` ON `quiz_folders` (`user_id`);