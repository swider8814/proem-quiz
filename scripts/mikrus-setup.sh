#!/usr/bin/env bash
# Proem Quiz – jednorazowe przygotowanie Mikrusa (kroki 1–4 z README).
# Uruchom na serwerze jako root:   bash mikrus-setup.sh
# Po pierwszym deployu (GitHub Actions):   bash mikrus-setup.sh admin jan@proem.pl "Jan Kowalski"
# Skrypt można uruchamiać wielokrotnie – niczego nie nadpisuje bez pytania.
#
# Bezpieczeństwo wobec innych usług na serwerze (np. app.proem.pl):
#  - quiz działa w osobnym projekcie Dockera, osobnej sieci, jako osobny użytkownik (uid 10471),
#    z systemem plików tylko do odczytu, bez uprawnień i z limitami RAM/CPU/procesów;
#  - widzi wyłącznie katalog /srv/proem-quiz/data;
#  - klucz SSH dla GitHuba może uruchomić TYLKO /srv/proem-quiz/deploy.sh (nie daje powłoki);
#  - docker-compose.yml zmienia się tylko przez ten skrypt, nie przy deployu.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/proem-quiz}" # poza katalogiem domowym roota – dostęp do odczytu dla kopii zapasowych
QUIZ_UID=10471
KEY_TAG=github-actions-proem-quiz

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }
ask() { # ask "Pytanie" "domyślna" -> echo odpowiedź
	local a
	read -r -p "  $1${2:+ [$2]}: " a || true
	printf '%s' "${a:-$2}"
}
yes_no() { # yes_no "Pytanie" -> 0 = tak
	local a
	read -r -p "  $1 [t/N]: " a || true
	[[ "$a" =~ ^[tTyY] ]]
}
random_key() {
	if command -v openssl >/dev/null; then openssl rand -base64 32; else head -c 32 /dev/urandom | base64; fi
}
port_busy() { # port_busy 20123 -> 0, jeśli ktoś już nasłuchuje
	if command -v ss >/dev/null; then ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; else return 1; fi
}

# --- tryb: utworzenie pierwszego administratora (po deployu) ---
if [[ "${1:-}" == "admin" ]]; then
	email="${2:-}"
	name="${3:-}"
	[[ -n "$email" ]] || { echo 'Użycie: bash mikrus-setup.sh admin <email> "<Imię Nazwisko>"'; exit 1; }
	cd "$APP_DIR"
	if ! docker compose ps --status running --services 2>/dev/null | grep -qx app; then
		echo "Aplikacja nie działa. Najpierw uruchom deploy w GitHub Actions (README, krok 5)."
		exit 1
	fi
	docker compose exec -T app node server/cli.js create-admin "$email" "$name"
	info "Otwórz powyższy link, ustaw hasło i zeskanuj kod QR aplikacją do kodów (2FA jest obowiązkowe)."
	exit 0
fi

[[ $EUID -eq 0 ]] || { echo "Uruchom jako root (na Mikrusie domyślnie jesteś rootem)."; exit 1; }

# Starsza wersja skryptu instalowała quiz w ~/proem-quiz – nie zakładamy po cichu drugiej, pustej instalacji.
OLD_DIR="$HOME/proem-quiz"
if [[ "$APP_DIR" != "$OLD_DIR" && -f "$OLD_DIR/.env" ]]; then
	warn "Znaleziono wcześniejszą instalację w $OLD_DIR (baza, pliki, .env). Przenieś ją najpierw:"
	info "  cd $OLD_DIR && docker compose down"
	info "  mv $OLD_DIR $APP_DIR"
	info "  bash $0        # zaktualizuje pliki i wygeneruje nowy klucz GitHuba (podmień sekret MIKRUS_SSH_KEY)"
	exit 1
fi

# --- 0. Co już działa na serwerze ---
bold "0/5 Stan serwera (inne usługi zostają nietknięte)"
if command -v docker >/dev/null; then
	info "Działające kontenery:"
	docker ps --format '    {{.Names}}  ({{.Image}})  porty: {{.Ports}}' || true
fi
info "Pamięć:"; free -h | sed 's/^/    /' || true
info "Dysk:"; df -h / | sed 's/^/    /' || true

# --- 1. Docker ---
bold "1/5 Docker"
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
	info "Docker jest zainstalowany: $(docker --version)"
else
	if yes_no "Docker nie jest zainstalowany. Zainstalować teraz (oficjalny skrypt get.docker.com)?"; then
		curl -fsSL https://get.docker.com | sh
		docker compose version >/dev/null || { warn "Brak 'docker compose' po instalacji – sprawdź ręcznie."; exit 1; }
	else
		warn "Bez Dockera aplikacja nie ruszy. Przerywam."
		exit 1
	fi
fi

# --- 2. Katalog, .env, docker-compose.yml, deploy.sh ---
bold "2/5 Katalog $APP_DIR"
# Grupa o numerze użytkownika quizu – należy do niej tylko konto kopii zapasowych (odczyt danych).
getent group "$QUIZ_UID" >/dev/null || groupadd -g "$QUIZ_UID" proem-quiz
mkdir -p "$APP_DIR/data"
chown "root:$QUIZ_UID" "$APP_DIR"
chmod 750 "$APP_DIR"
chown -R "$QUIZ_UID:$QUIZ_UID" "$APP_DIR/data"
chmod 750 "$APP_DIR/data"
info "Dane quizu: $APP_DIR/data (właściciel: uid $QUIZ_UID – kontener quizu; odczyt: konto kopii zapasowych)"

ENV_FILE="$APP_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
	info ".env już istnieje – istniejących wartości nie zmieniam (edycja: nano $ENV_FILE)."
else
	info "Port: jeden z portów TCP przydzielonych Twojemu Mikrusowi (panel Mikrusa), NIE używany przez inne usługi."
	while :; do
		port="$(ask 'Port aplikacji' '')"
		[[ "$port" =~ ^[0-9]{2,5}$ ]] || { warn "Niepoprawny port."; continue; }
		if port_busy "$port"; then warn "Port $port jest już zajęty (np. przez inną aplikację). Wybierz inny."; continue; fi
		break
	done
	domain="$(ask 'Domena quizu (bez https://)' 'quiz.proem.pl')"
	domain="${domain#https://}"; domain="${domain#http://}"; domain="${domain%%/*}"
	sg_key=""
	mail_from="quiz@proem.pl"
	if yes_no "Skonfigurować teraz SendGrid (e-maile z zaproszeniami i resetem hasła)?"; then
		read -r -s -p "  Klucz API SendGrid (SG...., nie będzie widoczny): " sg_key; echo
		mail_from="$(ask 'Adres nadawcy (zweryfikowany w SendGrid)' "$mail_from")"
	fi
	umask 077
	cat >"$ENV_FILE" <<EOF
# Proem Quiz – utworzone przez mikrus-setup.sh $(date -I)
PORT=$port
ORIGIN=https://$domain
TOTP_ENCRYPTION_KEY=$(random_key)
TRUSTED_PROXIES=
SENDGRID_API_KEY=$sg_key
MAIL_FROM=$mail_from
MAIL_FROM_NAME=Proem Quiz
# Limity kontenera (żeby quiz nie zabrał zasobów innym usługom)
QUIZ_UID=$QUIZ_UID
QUIZ_MEM=448m
QUIZ_CPUS=0.6
# Pliki quizów: łączny limit i minimalne wolne miejsce na dysku, poniżej którego wgrywanie jest blokowane
MEDIA_QUOTA_BYTES=2147483648
MEDIA_MIN_FREE_BYTES=3221225472
EOF
	chmod 600 "$ENV_FILE"
	info "Zapisano $ENV_FILE (tylko root może go czytać)."
	warn "TOTP_ENCRYPTION_KEY z tego pliku zapisz też w menedżerze haseł – bez niego logowanie z 2FA nie zadziała po odtworzeniu kopii."
fi

# Ustawienia dodane w nowszych wersjach skryptu – dopisywane do istniejącego .env, jeśli ich brakuje
# (wartości ustawione ręcznie zostają). Bez nich aplikacja użyłaby wyższych limitów domyślnych.
ensure_env() { # ensure_env KLUCZ WARTOŚĆ
	if ! grep -qE "^$1=" "$ENV_FILE"; then
		printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
		info "Dopisano do .env: $1=$2"
	fi
}
ensure_env QUIZ_UID "$QUIZ_UID"
ensure_env QUIZ_MEM 448m
ensure_env QUIZ_CPUS 0.6
ensure_env MEDIA_QUOTA_BYTES 2147483648
ensure_env MEDIA_MIN_FREE_BYTES 3221225472
chmod 600 "$ENV_FILE"

COMPOSE="$APP_DIR/docker-compose.yml"
write_compose() {
	cat >"$1" <<'COMPOSE_EOF'
# Proem Quiz na Mikrusie – /srv/proem-quiz/docker-compose.yml (zapisuje go scripts/mikrus-setup.sh).
# Plik zmienia się TYLKO ręcznie (ponowne uruchomienie skryptu), nie przy deployu z GitHuba:
# nawet przejęte repozytorium nie może przez niego dostać się do reszty serwera (np. app.proem.pl).
# Wartości z .env: PORT, QUIZ_UID, QUIZ_MEM, QUIZ_CPUS (domyślne poniżej – dobrane do Mikrusa 3.0:
# 1 rdzeń, 2 GB RAM bez swapu, obok app.proem.pl).
name: proem-quiz
services:
  app:
    image: ${QUIZ_IMAGE:-ghcr.io/swider8814/proem-quiz:latest}
    container_name: proem-quiz
    restart: unless-stopped
    env_file: .env
    environment:
      DATA_DIR: /data
      PORT: 3000
      # Adresy proxy (Cytrus), którym wolno podawać X-Forwarded-For – ustaw w .env (patrz README).
      TRUSTED_PROXIES: ${TRUSTED_PROXIES:-}
    ports:
      # Lewa strona = port Mikrusa, na który Cytrus kieruje ruch (z .env).
      # Tylko IPv4: Cytrus łączy się po IPv4, a zapora (mikrus-firewall.sh) obejmuje tylko IPv4 –
      # przy "[::]:PORT" docker-proxy wpuszczałby ruch IPv6 z pominięciem reguły „tylko Cytrus”.
      - "0.0.0.0:${PORT:-3000}:3000"
    volumes:
      # Jedyny katalog serwera widoczny dla quizu.
      - ./data:/data
    # ── Izolacja od reszty serwera ──
    user: "${QUIZ_UID:-10471}:${QUIZ_UID:-10471}" # własny numer użytkownika, inny niż inne kontenery
    read_only: true # system plików kontenera tylko do odczytu (zapis wyłącznie w /data i /tmp)
    tmpfs:
      - /tmp:size=64m,mode=1777
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    # ── Limity – awaria quizu nie zabierze zasobów innym usługom ──
    mem_limit: ${QUIZ_MEM:-448m}
    memswap_limit: ${QUIZ_MEM:-448m}
    cpus: ${QUIZ_CPUS:-0.6} # serwer ma 1 rdzeń – reszta zawsze zostaje dla innych usług
    cpu_shares: 256 # przy rywalizacji o procesor inne usługi (waga 1024) mają pierwszeństwo
    oom_score_adj: 500 # gdyby serwerowi zabrakło RAM-u, system zamyka najpierw quiz, nie app.proem.pl
    pids_limit: 256
    ulimits:
      nofile: { soft: 4096, hard: 4096 }
    networks: [quiz]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

# Osobna sieć: quiz nie widzi innych kontenerów na serwerze.
networks:
  quiz:
    name: proem-quiz-net
    driver_opts:
      # Stała nazwa mostka – zapora (scripts/mikrus-firewall.sh) blokuje po niej ruch quizu.
      com.docker.network.bridge.name: br-proem-quiz
    ipam:
      config:
        # Stała podsieć, poza sieciami app.proem.pl (172.17/16, 172.18/16, 172.30.148.0/24).
        - subnet: 172.31.148.0/24
COMPOSE_EOF
}

DEPLOY="$APP_DIR/deploy.sh"
write_deploy() {
	cat >"$1" <<'DEPLOY_EOF'
#!/usr/bin/env bash
# Proem Quiz – aktualizacja uruchamiana przez GitHub Actions (klucz SSH może wykonać TYLKO ten plik).
# Na wejściu (stdin) jednorazowy token do pobrania obrazu z ghcr.io. Dotyka wyłącznie projektu proem-quiz.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
export DOCKER_CONFIG="$PWD/.docker" # osobne dane logowania – nie ruszamy logowań innych usług
mkdir -p "$DOCKER_CONFIG" && chmod 700 "$DOCKER_CONFIG"

# stdin: "<użytkownik GitHuba> <token>" – nic innego nie jest przyjmowane.
read -r -t 10 GH_USER TOKEN || { echo "Brak danych na wejściu."; exit 2; }
[[ "$GH_USER" =~ ^[A-Za-z0-9-]{1,39}(\[bot\])?$ ]] || { echo "Nieprawidłowy użytkownik."; exit 2; }
[[ "$TOKEN" =~ ^[A-Za-z0-9_.-]{20,400}$ ]] || { echo "Nieprawidłowy token."; exit 2; }
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
printf '%s' "$TOKEN" | docker login ghcr.io -u "$GH_USER" --password-stdin >/dev/null

# Stan pozostałych kontenerów (np. app.proem.pl) – po aktualizacji sprawdzamy, że nikt ich nie ruszył.
others() { docker ps -q | xargs -r docker inspect -f '{{.Name}} {{.State.StartedAt}}' | grep -v '^/proem-quiz ' | sort || true; }
OTHERS_BEFORE="$(others)"
check_others() {
	if [[ "$(others)" != "$OTHERS_BEFORE" ]]; then
		echo "UWAGA: zmienił się stan innych kontenerów na serwerze – sprawdź app.proem.pl (docker ps)." >&2
	else
		echo "Inne kontenery bez zmian ($(printf '%s' "$OTHERS_BEFORE" | grep -c . || true))."
	fi
}

# Czekanie na zdrowy kontener (healthcheck z obrazu sprawdza też odczyt bazy). 0 = zdrowy.
wait_healthy() {
	for _ in $(seq 1 30); do
		[[ "$(docker inspect -f '{{.State.Health.Status}}' proem-quiz 2>/dev/null || echo none)" == healthy ]] && return 0
		sleep 3
	done
	return 1
}

# Poprzednia wersja na wypadek nieudanej aktualizacji.
OLD="$(docker compose images -q app 2>/dev/null | head -1 || true)"
if [[ -n "$OLD" ]]; then docker image tag "$OLD" proem-quiz:previous; fi

# Kopia bazy PRZED aktualizacją: nowa wersja może zmigrować bazę, a poprzednia nie musi umieć z nią
# pracować – wtedy samo przywrócenie obrazu nie wystarczy. Kopia jest sprawdzana (integrity_check) przez CLI;
# bez udanej kopii nie aktualizujemy. Retencja 365 dni – nie skraca rotacji kopii nocnych.
BACKUP=""
if [[ -n "$OLD" ]] && [[ "$(docker inspect -f '{{.State.Running}}' proem-quiz 2>/dev/null || echo false)" == true ]]; then
	BACKUP="quiz-$(date +%Y-%m-%d_%H%M).db"
	if ! docker compose exec -T app node server/cli.js backup "$BACKUP" 365 >/dev/null; then
		echo "BŁĄD: nie udało się zrobić kopii bazy przed aktualizacją – przerywam, nic nie zmieniono." >&2
		exit 1
	fi
	echo "Kopia przed aktualizacją: data/backup/$BACKUP"
fi

docker compose pull -q app
docker compose up -d app

if wait_healthy; then
	echo "OK: nowa wersja działa."
	check_others
	docker image prune -f --filter "label=org.opencontainers.image.source=https://github.com/swider8814/proem-quiz" >/dev/null || true
	exit 0
fi

echo "BŁĄD: nowa wersja nie wstała – przywracam poprzednią." >&2
docker compose logs --tail 50 app >&2 || true
if [[ -n "$OLD" ]]; then
	QUIZ_IMAGE=proem-quiz:previous docker compose up -d app
	# Przywrócenie liczy się dopiero, gdy poprzednia wersja faktycznie działa (np. po migracji bazy może nie).
	if wait_healthy; then
		echo "Przywrócono poprzednią wersję – działa (do następnego udanego deployu)." >&2
	else
		echo "BŁĄD KRYTYCZNY: poprzednia wersja też nie działa – prawdopodobnie baza została już zmigrowana." >&2
		if [[ -n "$BACKUP" ]]; then
			echo "Odtwórz bazę z kopii sprzed aktualizacji (README → Odtwarzanie), na serwerze:" >&2
			echo "  cd $PWD && docker compose stop app && cp data/quiz.db data/quiz.db.po-nieudanej-aktualizacji" >&2
			echo "  cp data/backup/$BACKUP data/quiz.db && rm -f data/quiz.db-wal data/quiz.db-shm && QUIZ_IMAGE=proem-quiz:previous docker compose up -d app" >&2
		fi
		docker compose logs --tail 30 app >&2 || true
	fi
fi
check_others
exit 1
DEPLOY_EOF
}

install_file() { # install_file <cel> <funkcja-zapisu> <uprawnienia> <opis>
	local target="$1" writer="$2" mode="$3" label="$4" tmp
	tmp="$(mktemp)"
	"$writer" "$tmp"
	if [[ -f "$target" ]] && cmp -s "$tmp" "$target"; then
		info "$label: aktualny."
		rm -f "$tmp"
	elif [[ ! -f "$target" ]] || yes_no "$label różni się od wersji ze skryptu. Zastąpić (stary zostanie jako .bak)?"; then
		if [[ -f "$target" ]]; then cp -p "$target" "$target.bak"; fi
		mv "$tmp" "$target"
		chown root:root "$target"
		chmod "$mode" "$target"
		info "$label: zapisany."
	else
		rm -f "$tmp"
	fi
}
install_file "$COMPOSE" write_compose 640 "docker-compose.yml"
install_file "$DEPLOY" write_deploy 700 "deploy.sh"

# --- 3. Klucz SSH dla GitHub Actions (tylko do uruchomienia deploy.sh) ---
bold "3/5 Klucz SSH dla GitHub Actions"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
SKIP_KEY=""
if grep -q "$KEY_TAG" ~/.ssh/authorized_keys; then
	if grep "$KEY_TAG" ~/.ssh/authorized_keys | grep -q "^command=\"$DEPLOY\","; then
		info "Klucz dla GitHub Actions jest już dodany (ograniczony do deploy.sh)."
		yes_no "Wygenerować NOWY klucz (trzeba będzie podmienić sekret MIKRUS_SSH_KEY)?" || SKIP_KEY=1
	else
		warn "Znaleziono klucz GitHub Actions bez ograniczenia do $DEPLOY (np. stary katalog albo pełny dostęp root). Zostanie zastąpiony."
	fi
	if [[ -z "$SKIP_KEY" ]]; then sed -i "/$KEY_TAG/d" ~/.ssh/authorized_keys; fi
fi
if [[ -z "$SKIP_KEY" ]]; then
	tmp="$(mktemp -d)"
	trap 'rm -rf "$tmp"' EXIT
	ssh-keygen -q -t ed25519 -N "" -C "$KEY_TAG" -f "$tmp/key"
	# restrict = bez powłoki, przekierowań portów i agenta; klucz uruchamia wyłącznie deploy.sh
	printf 'command="%s",restrict %s\n' "$DEPLOY" "$(cat "$tmp/key.pub")" >>~/.ssh/authorized_keys
	info "Skopiuj CAŁY poniższy blok (z liniami BEGIN/END) do sekretu MIKRUS_SSH_KEY:"
	echo
	cat "$tmp/key"
	echo
	rm -rf "$tmp"
	info "Klucz prywatny nie został zapisany na serwerze – jeśli go zgubisz, uruchom skrypt ponownie."
fi

# --- 4. Wartości sekretów ---
bold "4/5 Sekrety w GitHubie (repo → Settings → Secrets and variables → Actions)"
info "MIKRUS_HOST            = adres serwera z panelu Mikrusa (np. srv12.mikr.us); ta maszyna: $(hostname)"
info "MIKRUS_SSH_PORT        = port SSH z panelu Mikrusa"
info "MIKRUS_USER            = $(id -un)"
info "MIKRUS_SSH_KEY         = blok z kroku 3"
for t in ed25519 ecdsa rsa; do
	f="/etc/ssh/ssh_host_${t}_key.pub"
	[[ -f "$f" ]] || continue
	info "MIKRUS_SSH_FINGERPRINT = $(ssh-keygen -lf "$f" | awk '{print $2}')   (klucz $t$([[ $t == ed25519 ]] && echo ', użyj tego'))"
done

# --- 5. Dalej ---
bold "5/5 Dalej"
info "5. GitHub → Actions → „Build i deploy” → Run workflow."
info "6. Po zielonym deployu utwórz konto administratora:"
info "     bash $0 admin twoj@email.pl \"Imię Nazwisko\""
info "7. Cytrus: domena → http://<adres serwera>:<PORT>, potem test: https://<domena>/test-ws"
info "8. Sprawdź limity: docker stats --no-stream proem-quiz  (kolumna MEM LIMIT ≈ 448MiB)"
