# Proem Quiz

Aplikacja do quizów na żywo w stylu Kahoot, z pytaniami audio („jaka to piosenka?”).
Specyfikacja: dokument „Proem Quiz – specyfikacja” w Claude.

**Stack:** SvelteKit 3 (adapter-node) · Socket.IO · SQLite + Drizzle · Node 22 · PM2 na Mikrusie 3.0.

## Praca lokalnie

```bash
npm install
npm run dev        # http://localhost:5173  (Socket.IO działa też w dev)
npm run check      # TypeScript + Svelte
npm run build && npm start   # wersja produkcyjna na porcie 3000
```

Baza (`data/quiz.db`) tworzy się sama przy pierwszym uruchomieniu.
Po zmianie `src/lib/server/db/schema.ts`: `npm run db:generate`, a nowy plik w `drizzle/` trafia do repo.

## Struktura

```
server/index.js        serwer produkcyjny: migracje → SvelteKit + Socket.IO
server/realtime.js     komunikacja na żywo (na razie /diag do testu połączenia)
src/lib/server/db/     schemat bazy i połączenie
src/routes/test-ws/    strona testu WebSocketów
drizzle/               migracje SQL (uruchamiane automatycznie)
scripts/deploy.sh      deploy na serwerze (git pull → build → PM2)
```

## Pierwsze uruchomienie na Mikrusie (jednorazowo)

1. **Node 22 i PM2** (jeśli nie ma):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs build-essential ffmpeg
   npm i -g pm2 && pm2 startup
   ```
2. **Klucz deploy do repo** (żeby serwer mógł robić `git pull` z prywatnego repo):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/proem_quiz_deploy -N ""
   cat ~/.ssh/proem_quiz_deploy.pub   # → GitHub: repo → Settings → Deploy keys → Add (read-only)
   printf 'Host github.com\n  IdentityFile ~/.ssh/proem_quiz_deploy\n' >> ~/.ssh/config
   git clone git@github.com:swider8814/proem-quiz.git ~/proem-quiz
   ```
3. **Konfiguracja:** `cp ~/proem-quiz/.env.example ~/proem-quiz/.env` i uzupełnij
   (`PORT` = jeden z portów Mikrusa, `ORIGIN`, `DATA_DIR`, `TOTP_ENCRYPTION_KEY`).
4. **Start:** `bash ~/proem-quiz/scripts/deploy.sh`
5. **Domena przez Cytrus:** w panelu Mikrusa dodaj domenę (np. `quiz.proem.pl`) i jako cel
   wpisz `http://<IP lub adres serwera>:<PORT>`. W DNS domeny: rekord CNAME na `backend.strony.me`.
6. Wejdź na `https://quiz.proem.pl/test-ws` – zielony komunikat „WebSocket działa” = wszystko gotowe.
   Żółty („long-polling”) = Cytrus nie przepuszcza WebSocketów; aplikacja zadziała, ale daj znać.

## Automatyczny deploy (GitHub Actions)

Każdy push na `main` → sprawdzenie i build → SSH na Mikrusa → `scripts/deploy.sh`.

Na serwerze dodaj klucz, którym loguje się GitHub Actions:
```bash
ssh-keygen -t ed25519 -f ~/gha_deploy -N "" && cat ~/gha_deploy.pub >> ~/.ssh/authorized_keys
cat ~/gha_deploy   # zawartość → sekret MIKRUS_SSH_KEY, potem usuń plik: rm ~/gha_deploy*
```

W repo: **Settings → Secrets and variables → Actions** dodaj:

| Sekret | Przykład |
|---|---|
| `MIKRUS_HOST` | `srv12.mikr.us` |
| `MIKRUS_SSH_PORT` | port SSH z panelu Mikrusa |
| `MIKRUS_USER` | `root` |
| `MIKRUS_SSH_KEY` | prywatny klucz z kroku wyżej |
