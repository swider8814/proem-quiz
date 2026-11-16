-- Domyślny motyw Proem (kolory robocze - do podmiany na brandowe)
INSERT OR IGNORE INTO `themes` (`id`, `slug`, `name`, `colors`, `heading_font`, `is_default`)
VALUES (
  'theme_proem',
  'proem',
  'Proem',
  '{"background":"#1b1f3b","surface":"#262b52","text":"#ffffff","accent":"#f5b700","answers":["#e21b3c","#1368ce","#d89e00","#26890c"]}',
  'Inter',
  1
);
