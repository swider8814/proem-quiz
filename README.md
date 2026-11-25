# Proem Quiz

Aplikacja do quizów na żywo w stylu Kahoot, z pytaniami audio („jaka to piosenka?”).
Specyfikacja: dokument „Proem Quiz – specyfikacja” w Claude.

**Stack:** SvelteKit 3 (adapter-node) · Socket.IO · SQLite + Drizzle · Node 22 · Docker na Mikrusie 3.0.

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
Dockerfile             obraz aplikacji
docker-compose.yml     uruchomienie na Mikrusie
```

## Jak działa wdrożenie

Każdy push na `main`:
1. GitHub Actions sprawdza kod i buduje obraz Dockera,
2. wysyła go do GitHub Container Registry (`ghcr.io/swider8814/proem-quiz`),
3. łączy się z Mikrusem po SSH, pobiera nowy obraz i restartuje kontener.

Na Mikrusie nic się nie buduje – serwer tylko pobiera gotowy obraz. Dane (baza + pliki audio)
leżą w `~/proem-quiz/data` i przetrwają każdą aktualizację.

## Pierwsze uruchomienie na Mikrusie (jednorazowo, ok. 15 min)

1. **Zaloguj się na Mikrusa** (SSH, dane z panelu) i zainstaluj Dockera:
   ```bash
   curl -fsSL https://get.docker.com | sh
   docker compose version   # powinno pokazać wersję
   ```
2. **Utwórz katalog i plik `.env`:**
   ```bash
   mkdir -p ~/proem-quiz/data && cd ~/proem-quiz
   chown -R 1000:1000 data   # aplikacja w kontenerze działa jako zwykły użytkownik (uid 1000), nie root
   nano .env
   ```
   Wklej i uzupełnij:
   ```
   PORT=20123                       # jeden z portów przydzielonych Twojemu Mikrusowi
   ORIGIN=https://quiz.proem.pl
   TOTP_ENCRYPTION_KEY=...          # wygeneruj: openssl rand -base64 32
   TRUSTED_PROXIES=                 # na razie puste – uzupełnisz w kroku 8
   SENDGRID_API_KEY=SG....          # opcjonalnie: e-maile (zaproszenia, reset hasła)
   MAIL_FROM=quiz@proem.pl          # adres zweryfikowany w SendGrid (Sender Authentication)
   # opcjonalnie: MEDIA_QUOTA_BYTES=4294967296 (limit wszystkich plików), MEDIA_MIN_FREE_BYTES=1073741824
   ```
3. **Klucz SSH dla GitHub Actions:**
   ```bash
   ssh-keygen -t ed25519 -f ~/gha_deploy -N "" -C github-actions
   cat ~/gha_deploy.pub >> ~/.ssh/authorized_keys
   cat ~/gha_deploy          # skopiuj całość (z BEGIN/END) do sekretu MIKRUS_SSH_KEY
   rm ~/gha_deploy ~/gha_deploy.pub
   ```
4. **Sekrety w GitHubie:** repo → Settings → Secrets and variables → Actions → New repository secret:

   | Sekret | Wartość |
   |---|---|
   | `MIKRUS_HOST` | adres serwera, np. `srv12.mikr.us` |
   | `MIKRUS_SSH_PORT` | port SSH z panelu Mikrusa (np. `10123`) |
   | `MIKRUS_USER` | `root` |
   | `MIKRUS_SSH_KEY` | prywatny klucz z kroku 3 |
   | `MIKRUS_SSH_FINGERPRINT` | odcisk klucza serwera – patrz niżej |

   **Fingerprint serwera** (bez niego deploy się nie uruchomi – chroni przed podstawionym serwerem).
   Odczytaj go **na samym serwerze** (konsola w panelu Mikrusa albo sesja SSH, której odcisk już
   wcześniej potwierdziłeś), nie przez `ssh-keyscan` z zewnątrz:
   ```bash
   ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | awk '{print $2}'
   # wynik w postaci SHA256:AbCd... wklej w całości jako MIKRUS_SSH_FINGERPRINT
   ```
   Jeśli deploy zgłosi niezgodny odcisk, a serwer nie był zmieniany, sprawdź ten sam odcisk dla
   `/etc/ssh/ssh_host_ecdsa_key.pub` lub `ssh_host_rsa_key.pub` (zależy, którego klucza użyje połączenie).

5. **Uruchom deploy:** repo → Actions → „Build i deploy” → Run workflow (albo zrób dowolny push).
6. **Domena przez Cytrus:** w panelu Mikrusa dodaj domenę (np. `quiz.proem.pl`) i jako cel wpisz
   `http://<adres serwera>:<PORT z .env>`. W DNS domeny ustaw CNAME na `backend.strony.me`.
7. **Test:** wejdź na `https://quiz.proem.pl/test-ws`.
   Zielony „WebSocket działa” = gotowe. Żółty („long-polling”) = Cytrus nie przepuszcza
   WebSocketów; aplikacja zadziała, ale daj znać.
8. **Zaufane proxy (prawdziwe IP graczy):** zaloguj się jako admin i otwórz
   `https://quiz.proem.pl/panel/api/diag`. Pole `remoteAddress` to adres, z którego łączy się Cytrus.
   Wpisz go w `.env` (`TRUSTED_PROXIES=1.2.3.4`; kilka adresów lub sieci CIDR po przecinku),
   potem `docker compose up -d`. Ponownie otwórz `/panel/api/diag` – `resolvedClientIp` powinien
   pokazywać TWÓJ adres. Nie wpisuj adresów „na zapas”: każdy adres z tej listy może podać dowolne IP klienta.
   Jeśli Mikrus/Cytrus używa kilku adresów albo zmieni adres, `remoteAddress` to pokaże – zaktualizuj listę.
9. **(Zalecane) Zapora:** port aplikacji jest dostępny z internetu bezpośrednio, z pominięciem Cytrusa.
   Bez wpisu w `TRUSTED_PROXIES` takie połączenie i tak nie podrobi adresu IP, ale lepiej je zablokować:
   ```bash
   # tylko jeśli Mikrus pozwala na iptables; Docker omija ufw, dlatego reguła w łańcuchu DOCKER-USER
   iptables -I DOCKER-USER -p tcp --dport 3000 ! -s <ADRES_CYTRUSA> -j DROP
   ```
   Sprawdzenie z innego komputera: `curl -m 5 http://<adres serwera>:<PORT>/health` powinien
   się nie połączyć, a `https://quiz.proem.pl/health` – działać.

## Przydatne komendy na serwerze

```bash
cd ~/proem-quiz
docker compose logs -f --tail 100   # logi na żywo
docker compose restart              # restart
docker compose ps                   # stan
```

## Uruchomienie lokalne bez internetu (np. obóz)

Ten sam obraz działa na każdym komputerze z Dockerem:
```bash
docker run -d -p 3000:3000 -v ./data:/data -e ORIGIN=http://<IP laptopa>:3000 ghcr.io/swider8814/proem-quiz
```
Telefony w tej samej sieci Wi-Fi wchodzą na `http://<IP laptopa>:3000`.
