# Bezpieczeństwo – Proem Quiz

Model zagrożeń: [`docs/threat-model.md`](docs/threat-model.md).

## Zgłaszanie problemów
Problemy bezpieczeństwa zgłaszaj prywatnie administratorowi projektu (Fundacja Proem), nie w publicznym issue.

## Wytyczne dla przeglądów bezpieczeństwa
- Pisz po polsku. Dla każdego problemu podaj: wagę, plik i linię, konkretny scenariusz (dane wejściowe → skutek) i poprawkę.
- Gracze to często **dzieci**: każda ścieżka, przez którą treść jednego gracza (nick, odpowiedź tekstowa)
  trafia na rzutnik lub do innych graczy, wymaga filtra i escapowania. Nie zbieramy danych osobowych graczy.
- **Najważniejsze obszary** (zgłaszaj także średnie problemy):
  - `src/hooks.server.ts`, `src/lib/server/auth/**`, `src/routes/login/**`, `src/routes/invite/**`, `src/routes/panel/2fa-setup/**` –
    logowanie, sesje, obowiązkowe TOTP adminów;
  - `server/realtime.js`, `server/game/**` – jeden proces obsługuje wszystkie gry; wyjątek lub zablokowanie pętli zdarzeń = koniec gier na sali;
  - `src/lib/server/media*.ts`, `src/routes/media/**`, `src/routes/panel/api/media/**` – niezaufane pliki i ffmpeg;
  - `server/net.js` – zaufanie do `X-Forwarded-For` tylko z `TRUSTED_PROXIES`.
- Niezmienniki, których łamanie jest zawsze problemem:
  - kontrola dostępu po `event.route.id`, nigdy po surowej ścieżce URL;
  - poprawne odpowiedzi i punkty bieżącego pytania nie trafiają do gracza przed `reveal`;
  - czas odpowiedzi i punkty liczy wyłącznie serwer;
  - limity prób rezerwowane przed operacjami asynchronicznymi; zużycie zaproszeń, kodów TOTP i kodów zapasowych – atomowe;
  - plik audio/zdjęcie z pytania dostępne tylko dla właściciela, admina lub osób z dostępem do quizu;
  - kolory motywu trafiają do CSS wyłącznie jako `#hex`; brak `{@html}` z danymi od użytkowników.
- Nie zgłaszaj: braku funkcji planowanych w README, ataków wymagających dostępu do serwera lub kont GitHub/ChatGPT,
  DDoS na poziomie sieci.
