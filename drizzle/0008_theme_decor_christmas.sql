ALTER TABLE `themes` ADD `decor` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `themes` (`id`, `slug`, `name`, `style`, `colors`, `heading_font`, `decor`, `is_default`) VALUES
  ('theme_proem_christmas', 'swieta-bozego-narodzenia', 'Święta Bożego Narodzenia', 'vivid',
   '{"background":"#0f4a33","surface":"#fffaf0","text":"#ffffff","accent":"#f4c542","answers":["#d62839","#1d6fd1","#c98a00","#2a8c3a"]}', 'Montserrat', 'snow', 0);
