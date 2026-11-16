# Proem Quiz – wskazówki dla agentów

Aplikacja do quizów na żywo (styl Kahoot) z pytaniami audio, używana na wydarzeniach fundacji,
także przez dzieci. SvelteKit 3 (adapter-node) + Socket.IO + SQLite (Drizzle), Node 22, Docker.
Model zagrożeń: `docs/threat-model.md`.

## Uruchamianie i testy
- `npm run check` – TypeScript + Svelte
- `npm run build` – build produkcyjny (wymagany przed testami e2e)
- `npm test` – testy jednostkowe i Socket.IO (wymaga ffmpeg)
- `npm run test:e2e` – testy HTTP i bezpieczeństwa na osobnym procesie serwera
- `npm run test:ui` – cała gra i edytor w Chrome (prowadzący + telefony); `CHROME_PATH` wskazuje przeglądarkę
- `npm run test:load` – 300 graczy przez Socket.IO, serwer na jednym rdzeniu (progi opóźnień i RAM)

## Code Review Rules
- Pisz review **po polsku**.
- Priorytety: (1) bezpieczeństwo kont i 2FA, (2) stabilność procesu podczas gry na żywo,
  (3) dane i bezpieczeństwo dzieci, (4) uczciwość gry, (5) działanie na telefonach (zwłaszcza iOS Safari).
- Zgłaszaj tylko problemy, które potrafisz uzasadnić konkretnym scenariuszem (dane wejściowe → skutek).
- Kontrola dostępu musi opierać się na `event.route.id`, nie na surowym `url.pathname`.
- Wszystkie dane od klienta Socket.IO są niezaufane: sprawdzaj typ i długość, bez `String()` na obiektach;
  handler nie może rzucić nieobsłużonego wyjątku.
- Poprawne odpowiedzi ani punkty za bieżące pytanie nie mogą trafić do gracza przed fazą `reveal`.
- Limity prób muszą być rezerwowane synchronicznie, przed operacjami asynchronicznymi.
- Każda nowa luka powinna mieć test regresji w `tests/`.
- Nie zgłaszaj stylu kodu, nazewnictwa ani braku funkcji opisanych jako przyszłe etapy w README.
