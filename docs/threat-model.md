# Model zagrożeń – Proem Quiz

## Czym jest system
Aplikacja do quizów na żywo (styl Kahoot) z pytaniami audio. Używana na wydarzeniach fundacji
(Wigilia kursu angielskiego, szkoła Proem Edu, obozy Proem Zako) – **gracze to często dzieci**.
Jeden proces Node.js (SvelteKit + Socket.IO), SQLite, pliki na dysku, Docker na VPS (Mikrus)
za reverse proxy Nginx (Cytrus). Stan gier w pamięci procesu.

## Aktorzy
| Aktor | Uwierzytelnienie | Uprawnienia |
|---|---|---|
| Administrator | e-mail + hasło + obowiązkowe TOTP | wszystko: konta, motywy, wszystkie quizy |
| Autor | e-mail + hasło (+ opcjonalne TOTP) | własne i udostępnione quizy, własne pliki |
| Prowadzący | autor/admin + token gry (z panelu) | sterowanie jedną grą |
| Gracz | brak konta: PIN + nick, token gracza w localStorage | odpowiadanie w jednej grze |
| Anonim z internetu | brak | strony publiczne, /play, publiczne logotypy |

## Zasoby do ochrony (od najważniejszych)
1. **Konta admina** – przejęcie = pełna kontrola, w tym tworzenie kont i usuwanie danych.
2. **Dzieci jako gracze** – nie mogą zobaczyć treści nieodpowiednich (nicki innych graczy na rzutniku),
   nie zbieramy ich danych osobowych. W trakcie gry: nick (domyślnie losowy) i opcjonalne imiona
   członków drużyny – tylko w pamięci. Po grze zostaje wyłącznie raport z nickami i punktami
   (bez imion członków drużyn), widoczny dla osób z dostępem do quizu i usuwany po 90 dniach.
3. **Dostępność gry w trakcie wydarzenia** – awaria procesu przerywa wszystkie trwające gry.
4. **Uczciwość gry** – poprawne odpowiedzi nie mogą wyciec przed końcem pytania; czas i punkty liczy serwer.
5. **Pliki** – nagrania audio (prawa autorskie) i zdjęcia nie mogą być publiczne.
6. **Sekrety** – TOTP_ENCRYPTION_KEY, klucze SSH deployu, token GHCR.

## Granice zaufania
- Przeglądarka gracza ↔ Socket.IO `/game` (wszystkie dane od gracza są niezaufane).
- Przeglądarka panelu ↔ SvelteKit (formularze + JSON API pod `/panel/api`).
- Cytrus (Nginx) ↔ aplikacja: `X-Forwarded-For` ufamy tylko z adresów `TRUSTED_PROXIES`.
- Upload plików ↔ ffmpeg/ffprobe (niezaufane pliki przetwarzane przez zewnętrzny program).
- GitHub Actions ↔ serwer (SSH z weryfikacją fingerprintu).

## Główne zagrożenia i obecne zabezpieczenia
| Zagrożenie | Zabezpieczenie |
|---|---|
| Obejście 2FA / przejęcie sesji | kontrola po `event.route.id`, sesje pośrednie, rotacja tokenu po MFA, atomowe zużycie kodów |
| Zgadywanie haseł / kodów | limity rezerwowane przed operacją async, kolejka Argon2 |
| Zatrzymanie procesu złośliwym pakietem | walidacja typów wszystkich danych Socket.IO, try/catch w handlerach |
| Zgadywanie PIN-ów | limit nieudanych prób na IP (przyjazny dla NAT ~300 osób) |
| Wyciek poprawnej odpowiedzi | `publicQuestion()` bez rozwiązań; wynik gracza ukryty do końca pytania |
| Wulgarne nicki na rzutniku | filtr PL/EN/UK (NFKC, leet, cyrylica), moderacja przez prowadzącego |
| Wyczerpanie zasobów przez uploady | limity rozmiaru, długości, kolejka ffmpeg, kwota dysku |
| Dostęp do cudzych plików | `canUseMedia` (właściciel / admin / dostęp do quizu, który używa pliku) |
| XSS | Svelte escapuje treści; CSP z nonce; kolory motywu tylko `#hex`; brak `{@html}` |
| CSRF | kontrola Origin (SvelteKit + własna dla `/panel/api`), SameSite=Lax |
| Obrazki odpowiedzi dla telefonów bez logowania | `/game-media/<PIN>/<id>`: tylko obrazki odpowiedzi BIEŻĄCEGO pytania trwającej gry, miniatury 480 px |
| Metadane zdjęć (np. GPS), „bomby” pikselowe | każdy obrazek przekodowany bez metadanych; > 40 Mpx odrzucane przed dekodowaniem |
| Formuły w eksporcie CSV (nick „=…”) | komórki zaczynające się od `= + - @` poprzedzone apostrofem |
| Dane dzieci w raportach | na graczu tylko nick, miejsce i punkty (bez imion członków drużyn i bez przebiegu odpowiedzi); statystyki pytań wyłącznie zbiorcze; usuwane po 90 dniach (kopie zapasowe – według ich retencji) |
| Przejęty kontener → serwer / app.proem.pl | osobny użytkownik, sieć, limity, tylko `./data`; zapora `scripts/mikrus-firewall.sh` (host i sieci prywatne zablokowane) |
| Okno widzów przejęte przez obcą stronę | BroadcastChannel działa tylko w tej samej domenie; kanał per gra (PIN) |

## Poza zakresem
Ataki fizyczne na VPS, kompromitacja kont GitHub/ChatGPT, DDoS na poziomie sieci (poza limitami aplikacji).
