UPDATE `themes` SET `name` = 'Proem – plakatowy', `style` = 'poster',
  `colors` = '{"background":"#dff1ff","surface":"#ffffff","text":"#111111","accent":"#ffc93c","answers":["#ff5d8f","#3d7bff","#ffc93c","#2ec27e"]}',
  `heading_font` = 'Archivo'
WHERE `id` = 'theme_proem';
--> statement-breakpoint
INSERT OR IGNORE INTO `themes` (`id`, `slug`, `name`, `style`, `colors`, `heading_font`, `is_default`) VALUES
  ('theme_proem_vivid', 'proem-kolorowy', 'Proem – kolorowy', 'vivid',
   '{"background":"#2a1a5e","surface":"#ffffff","text":"#ffffff","accent":"#ffd23f","answers":["#e21b3c","#1368ce","#d89e00","#26890c"]}', 'Montserrat', 0);
--> statement-breakpoint
INSERT OR IGNORE INTO `themes` (`id`, `slug`, `name`, `style`, `colors`, `heading_font`, `is_default`) VALUES
  ('theme_proem_calm', 'proem-jasny', 'Proem – jasny', 'calm',
   '{"background":"#f3f5fa","surface":"#ffffff","text":"#17203a","accent":"#1f4fd1","answers":["#d7263d","#1f4fd1","#b26b00","#1b7a3a"]}', 'Plus Jakarta Sans', 0);
--> statement-breakpoint
INSERT OR IGNORE INTO `app_settings` (`key`, `value`) VALUES ('org_name', 'Proem');
