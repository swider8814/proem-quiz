CREATE TABLE `game_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`host_id` text,
	`title` text NOT NULL,
	`player_count` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_reports_quiz_idx` ON `game_reports` (`quiz_id`,`ended_at`);