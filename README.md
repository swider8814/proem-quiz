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
leżą w `/srv/proem-quiz/data` i przetrwają każdą aktualizację.

## Pierwsze uruchomienie na Mikrusie (jednorazowo, ok. 15 min)

Na Mikrusie działają też inne usługi (np. app.proem.pl), dlatego quiz jest od nich odizolowany:
- osobny projekt i sieć Dockera (`proem-quiz`), komendy quizu nie dotykają innych kontenerów;
- kontener działa jako osobny użytkownik (uid 10471), bez uprawnień, z systemem plików tylko do odczytu
  i widzi wyłącznie `/srv/proem-quiz/data`;
- limity: 600 MB RAM, 1 rdzeń, 256 procesów, 2 GB na pliki quizów i blokada wgrywania, gdy na dysku
  zostaje mniej niż 3 GB (wartości w `.env`: `QUIZ_MEM`, `QUIZ_CPUS`, `MEDIA_QUOTA_BYTES`, `MEDIA_MIN_FREE_BYTES`);
- klucz SSH GitHuba może uruchomić **tylko** `/srv/proem-quiz/deploy.sh` (bez powłoki i kopiowania plików),
  a `docker-compose.yml` zmienia się wyłącznie ręcznie – przejęte repozytorium nie dostanie się do reszty serwera;
- nieudana aktualizacja (kontener nie wstaje) jest automatycznie cofana do poprzedniej wersji.

1. **Skrypt przygotowania** (Docker, katalog, `.env`, `docker-compose.yml`, `deploy.sh`, klucz SSH):
   na GitHubie otwórz `scripts/mikrus-setup.sh` → „Copy raw file”. Na Mikrusie (SSH):
   ```bash
   nano mikrus-setup.sh      # wklej, zapisz: Ctrl+O, Enter, Ctrl+X
   bash mikrus-setup.sh
   ```
   Skrypt najpierw pokaże działające kontenery, wolny RAM i dysk – sprawdź, czy wszystko się zgadza.
   Port wybierz z przydzielonych w panelu Mikrusa; skrypt odrzuci port, którego używa inna usługa.
   Skrypt można uruchomić ponownie (np. po zmianie `docker-compose.yml` w repo) – niczego nie nadpisze bez pytania.
2. **Klucz `TOTP_ENCRYPTION_KEY`** z `/srv/proem-quiz/.env` zapisz w menedżerze haseł (potrzebny przy odtwarzaniu kopii).
3. Wartości do sekretów GitHuba skrypt wypisuje na końcu (krok 4).
4. **Sekrety w GitHubie:** repo → Settings → Secrets and variables → Actions → New repository secret:

   | Sekret | Wartość |
   |---|---|
   | `MIKRUS_HOST` | adres serwera, np. `srv12.mikr.us` |
   | `MIKRUS_SSH_PORT` | port SSH z panelu Mikrusa (np. `10123`) |
   | `MIKRUS_USER` | `root` |
   | `MIKRUS_SSH_KEY` | prywatny klucz wypisany przez skrypt |
   | `MIKRUS_SSH_FINGERPRINT` | odcisk klucza serwera – patrz niżej |

   **Fingerprint serwera** (bez niego deploy się nie uruchomi – chroni przed podstawionym serwerem).
   Skrypt wypisuje go z plików serwera. Ręcznie – **na samym serwerze** (konsola w panelu Mikrusa albo
   sesja SSH, której odcisk już wcześniej potwierdziłeś), nie przez `ssh-keyscan` z zewnątrz:
   ```bash
   ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | awk '{print $2}'
   # wynik w postaci SHA256:AbCd... wklej w całości jako MIKRUS_SSH_FINGERPRINT
   ```
   Jeśli deploy zgłosi niezgodny odcisk, a serwer nie był zmieniany, sprawdź ten sam odcisk dla
   `/etc/ssh/ssh_host_ecdsa_key.pub` lub `ssh_host_rsa_key.pub` (zależy, którego klucza użyje połączenie).

5. **Uruchom deploy:** repo → Actions → „Build i deploy” → Run workflow (albo zrób dowolny push).
   Po zielonym deployu utwórz pierwszego administratora:
   ```bash
   cd /srv/proem-quiz && docker compose exec app node server/cli.js create-admin twoj@email.pl "Imię Nazwisko"
   ```
   Otwórz wypisany link, ustaw hasło i zeskanuj kod QR aplikacją do kodów (Google Authenticator, Aegis…).
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
   # tylko jeśli Mikrus pozwala na iptables; Docker omija ufw, dlatego reguła w łańcuchu DOCKER-USER.
   # Dopasowanie po PORCIE QUIZU Z .env (--ctorigdstport), nie po porcie w kontenerze (3000) –
   # inne kontenery (np. app.proem.pl) mogą wewnętrznie też używać 3000 i nie mogą zostać zablokowane.
   iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport <PORT_Z_.env> ! -s <ADRES_CYTRUSA> -j DROP
   # jeśli Cytrus łączy się po IPv6 (remoteAddress z kroku 8 zawiera „:”), to samo dla ip6tables
   ```
   Po dodaniu reguły sprawdź, czy app.proem.pl nadal działa.
   Sprawdzenie z innego komputera: `curl -m 5 http://<adres serwera>:<PORT>/health` powinien
   się nie połączyć, a `https://quiz.proem.pl/health` – działać.

## Kopie zapasowe (NAS + Dysk współdzielony Google)

Co noc o 02:30 serwer robi spójną kopię bazy (`/srv/proem-quiz/data/backup`, 7 dni na serwerze) i wysyła
**zaszyfrowaną** kopię bazy oraz nowe pliki audio/obrazy na Dysk współdzielony Google (kopie bazy: 90 dni,
potem kosz Dysku jeszcze 30 dni). Rano **NAS sam pobiera** kopię przez SSH (nic nie otwieracie u siebie),
a migawki Btrfs na NAS-ie trzymają historię 90 dni. Stan ostatniej kopii: panel → Ustawienia.

Kto co może:
- NAS: klucz pozwala **tylko czytać** `/srv/proem-quiz/data` (rrsync -ro, bez powłoki). Serwer nie ma żadnego dostępu do NAS-a.
- Serwer → Dysk Google: konto techniczne widzi tylko jeden Dysk współdzielony; usunięte pliki trafiają do kosza.
  Zawartość jest szyfrowana – bez dwóch haseł z menedżera haseł nikt (także Google) jej nie odczyta.

### 1. Google (raz, ok. 15 min)
1. https://console.cloud.google.com → nowy projekt, np. `proem-quiz-kopie`.
2. **Interfejsy API i usługi → Biblioteka → Google Drive API → Włącz.**
3. **IAM → Konta usługi → Utwórz** (np. `quiz-kopie`), bez ról w projekcie → zakładka **Klucze → Dodaj klucz → JSON**.
   Jeśli Google zablokuje tworzenie klucza („disableServiceAccountKeyCreation” – domyślnie włączone w nowszych
   organizacjach), w **IAM → Zasady organizacji** dodaj wyjątek **tylko dla tego projektu** i spróbuj ponownie.
4. Dysk Google → **Dyski współdzielone → Nowy**, np. „Kopie – Proem Quiz”. **Zarządzaj użytkownikami** → dodaj
   adres konta usługi (`…@….iam.gserviceaccount.com`) z rolą **Menedżer treści** (nie „Menedżer”).
   Jeśli Workspace nie pozwala dodać adresu spoza domeny: Konsola administracyjna → Aplikacje → Google Workspace →
   Dysk i Dokumenty → Ustawienia udostępniania (zezwól dla tej jednostki albo dodaj domenę `iam.gserviceaccount.com`).
5. ID dysku to końcówka adresu po otwarciu dysku: `drive.google.com/drive/folders/<ID>`.

### 2. Serwer
```bash
nano mikrus-backup-setup.sh                   # wklej scripts/mikrus-backup-setup.sh z GitHuba
bash mikrus-backup-setup.sh                   # za pierwszym razem poprosi o zapisanie pliku JSON, potem uruchom ponownie
bash /srv/proem-quiz/backup.sh                # pierwsza kopia od razu
```
Skrypt zapyta o klucz publiczny NAS-a (krok 3) i ID dysku, wypisze **dwa hasła szyfrowania** – zapisz je
w menedżerze haseł razem z `TOTP_ENCRYPTION_KEY`. Plik JSON klucza po konfiguracji usuń z komputera.

### 3. NAS Synology
1. Utwórz folder współdzielony `Kopie` (wolumen Btrfs, dostęp tylko dla administratorów).
2. Wgraj `scripts/nas-pull.sh` do `Kopie/proem-quiz/` i uzupełnij 4 wartości na początku pliku
   (`SERVER_FINGERPRINT` wypisuje mikrus-backup-setup.sh).
3. **Panel sterowania → Harmonogram zadań → Utwórz → Zadanie zaplanowane → Skrypt zdefiniowany przez użytkownika**,
   użytkownik `root`: jednorazowo `bash /volume1/Kopie/proem-quiz/nas-pull.sh init` (wynik = klucz publiczny do kroku 2),
   potem codziennie o 05:00 `bash /volume1/Kopie/proem-quiz/nas-pull.sh` z powiadomieniem e-mail przy błędzie.
4. **Snapshot Replication → Migawki → `Kopie`**: codziennie 06:00, przechowywanie 90 dni.

### Przed wydarzeniem
`bash /srv/proem-quiz/backup.sh` – świeża kopia na serwerze i na Dysku.

### Odtwarzanie
Z NAS-a (najprościej) – na serwerze:
```bash
cd /srv/proem-quiz && docker compose stop app
cp data/quiz.db data/quiz.db.przed-odtworzeniem
cp <kopia>/backup/quiz-RRRR-MM-DD_GGMM.db data/quiz.db   # plik z NAS-a (np. scp z komputera)
rm -f data/quiz.db-wal data/quiz.db-shm
rsync -a <kopia>/media/ data/media/                        # brakujące pliki audio/obrazy
chown -R 10471:10471 data && docker compose up -d
```
Z Dysku Google (gdy NAS niedostępny): z `rclone.conf` i dwóch haseł –
`rclone copy gcrypt:db/<plik> .` oraz `rclone copy gcrypt:media media/` (konfiguracja: `backup-config/rclone.conf`).
Kopie nie zawierają sesji logowania – po odtworzeniu wszyscy logują się ponownie (hasło + 2FA, ten sam `TOTP_ENCRYPTION_KEY`).

## Przydatne komendy na serwerze

```bash
cd /srv/proem-quiz
docker compose logs -f --tail 100   # logi na żywo
docker compose restart              # restart
docker compose ps                   # stan
```

## Próba na własnym komputerze (przed wdrożeniem, albo na obozie bez internetu)

Działa na Windows, macOS i Linuksie z **Docker Desktop**. Komputer i telefony muszą być w tej samej sieci Wi-Fi.

1. Pobierz kod: GitHub → repozytorium → **Code → Download ZIP** (rozpakuj) albo sklonuj przez GitHub Desktop.
2. W folderze z kodem skopiuj `.env.local.example` jako `.env.local` i uzupełnij:
   `ORIGIN=http://<adres IP komputera>:3000` oraz `TOTP_ENCRYPTION_KEY` (polecenie w pliku).
3. W terminalu (Windows: PowerShell) w tym folderze:
   ```bash
   docker compose -f docker-compose.local.yml --env-file .env.local up --build
   ```
   Pierwsze budowanie trwa kilka minut. Windows może zapytać o dostęp do sieci – zezwól (sieci prywatne).
4. W drugim oknie terminala – pierwszy administrator:
   ```bash
   docker compose -f docker-compose.local.yml --env-file .env.local exec app node server/cli.js create-admin twoj@email.pl "Imię Nazwisko"
   ```
5. Otwórz wypisany link **przez adres IP** (nie `localhost` – tak samo jak w `ORIGIN`), ustaw hasło i 2FA.
   Telefony dołączają przez kod QR na ekranie prowadzącego.
6. (Opcjonalnie) dwa gotowe quizy do próby – polski i angielski z polskim drugim wierszem, wszystkie typy pytań oprócz audio:
   ```bash
   docker compose -f docker-compose.local.yml --env-file .env.local exec app node server/cli.js demo-quiz twoj@email.pl
   ```
   Pytanie audio dodaj w edytorze z własnym plikiem MP3.

Zatrzymanie: Ctrl+C. Dane zostają w wolumenie Dockera (`proem-quiz-local_data`); usunięcie wszystkiego:
`docker compose -f docker-compose.local.yml down -v`.
