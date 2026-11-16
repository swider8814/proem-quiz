#!/usr/bin/env bash
# Proem Quiz – konfiguracja kopii zapasowych na Mikrusie (po mikrus-setup.sh i pierwszym deployu).
# Uruchom na serwerze jako root:   bash mikrus-backup-setup.sh
#
# Co robi (wszystko tylko dla quizu, inne usługi zostają nietknięte):
#  1. /srv/proem-quiz/backup.sh + cron 02:30 – spójna kopia bazy (7 dni na serwerze) i plików;
#  2. konto „quiz-backup” dla NAS-a: klucz SSH może TYLKO czytać /srv/proem-quiz/data (rrsync -ro),
#     bez powłoki – NAS pobiera kopię sam, nic nie otwiera u Was w sieci;
#  3. (opcjonalnie) szyfrowana kopia na Dysk współdzielony Google przez konto techniczne
#     (service account) z rolą „Menedżer treści” – stare kopie trafiają do kosza Dysku (30 dni na odzyskanie).
# Skrypt można uruchamiać wielokrotnie – niczego nie nadpisuje bez pytania.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/proem-quiz}"
QUIZ_UID=10471
BACKUP_USER=quiz-backup
RCLONE_IMAGE=rclone/rclone:1.68.2

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }
ask() {
	local a
	read -r -p "  $1${2:+ [$2]}: " a || true
	printf '%s' "${a:-$2}"
}
yes_no() {
	local a
	read -r -p "  $1 [t/N]: " a || true
	[[ "$a" =~ ^[tTyY] ]]
}

[[ $EUID -eq 0 ]] || { echo "Uruchom jako root."; exit 1; }
[[ -f "$APP_DIR/docker-compose.yml" ]] || { echo "Najpierw uruchom mikrus-setup.sh (brak $APP_DIR)."; exit 1; }

write_backup() {
	cat >"$1" <<'BACKUP_EOF'
#!/usr/bin/env bash
# Proem Quiz – kopia zapasowa. Cron co noc o 02:30; ręcznie przed wydarzeniem:  bash /srv/proem-quiz/backup.sh
#  - spójna kopia bazy + migawka plików z tej samej chwili do data/backup/ (7 dni; NAS pobiera rano),
#  - jeśli skonfigurowano: szyfrowana kopia na Dysk współdzielony Google (90 dni).
# Stan ostatniej kopii widać w panelu: Ustawienia → Kopie zapasowe.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
KEEP_LOCAL_DAYS=7
KEEP_DRIVE_DAYS=90
RCLONE_IMAGE=rclone/rclone:1.68.2
STAMP="${BACKUP_STAMP:-$(date +%Y-%m-%d_%H%M)}"
[[ "$STAMP" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}$ ]] || { echo "Zły znacznik czasu."; exit 2; }
DB="backup/quiz-$STAMP.db"

exec 9>.backup.lock # w katalogu aplikacji (należy do roota), nie w /tmp
flock -n 9 || { echo "Kopia już trwa."; exit 0; }
log() { echo "$(date -Is) $*"; }

# Kopię, rotację i stan dla panelu wykonuje aplikacja (jako swój użytkownik) – root nie zapisuje
# ani nie kasuje niczego w katalogu danych, który kontroluje kontener.
app_cli() { docker compose exec -T app node server/cli.js "$@"; }
status() { app_cli backup-status "$1" "$(basename "$DB")" "$2" >/dev/null || log "Nie udało się zapisać stanu kopii."; }

# rclone w osobnym, zamkniętym kontenerze: dane tylko do odczytu, bez uprawnień poza czytaniem plików.
# (W testach: RCLONE=ścieżka-do-rclone, wtedy działa lokalnie.)
if [[ -n "${RCLONE:-}" ]]; then
	D="$PWD/data"
	rc() { RCLONE_CONFIG="$PWD/backup-config/rclone.conf" "$RCLONE" "$@"; }
else
	D=/data
	rc() {
		docker run --rm --read-only --tmpfs /tmp --cap-drop ALL --cap-add DAC_READ_SEARCH \
			--security-opt no-new-privileges --memory 256m --pids-limit 128 \
			-e RCLONE_CONFIG=/config/rclone.conf -e RCLONE_CACHE_DIR=/tmp \
			-v "$PWD/data:/data:ro" -v "$PWD/backup-config:/config:ro" \
			"$RCLONE_IMAGE" "$@"
	}
fi

log "Kopia bazy → data/$DB"
if ! app_cli backup "$(basename "$DB")" "$KEEP_LOCAL_DAYS"; then
	log "BŁĄD: nie udało się zrobić kopii bazy (czy aplikacja działa?)."
	status failed off
	exit 1
fi

drive=off
if [[ -f backup-config/rclone.conf ]]; then
	drive=ok
	log "Wysyłanie na Dysk Google (szyfrowane)"
	# Pliki z migawki tej samej chwili co baza; są niezmienne – kopiujemy tylko nowe (--immutable chroni przed nadpisaniem).
	rc copy "$D/backup/media-$STAMP" gcrypt:media --immutable --transfers 2 --log-level NOTICE || drive=failed
	rc copy "$D/$DB" gcrypt:db --log-level NOTICE || drive=failed
	# Kopie bazy starsze niż 90 dni → kosz Dysku (tam jeszcze 30 dni na odzyskanie).
	if [[ "$drive" == ok ]]; then
		rc delete gcrypt:db --min-age "${KEEP_DRIVE_DAYS}d" --include 'quiz-*.db' --log-level NOTICE || drive=failed
	fi
	[[ "$drive" == ok ]] || log "BŁĄD: wysyłanie na Dysk Google nie powiodło się."
fi

status ok "$drive"
log "Gotowe (Dysk Google: $drive)."
[[ "$drive" != failed ]]
BACKUP_EOF
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

# --- 1. Skrypt kopii i harmonogram ---
bold "1/3 Kopia na serwerze (co noc o 02:30)"
install_file "$APP_DIR/backup.sh" write_backup 700 "backup.sh"
command -v flock >/dev/null || { warn "Brak programu flock (pakiet util-linux) – zainstaluj go."; exit 1; }
if [[ -d /etc/cron.d ]]; then
	cat >/etc/cron.d/proem-quiz-backup <<EOF
# Proem Quiz – nocna kopia zapasowa (mikrus-backup-setup.sh)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 2 * * * root nice -n 10 $APP_DIR/backup.sh >> /var/log/proem-quiz-backup.log 2>&1
EOF
	chmod 644 /etc/cron.d/proem-quiz-backup
	info "Harmonogram: /etc/cron.d/proem-quiz-backup (02:30 czasu serwera: $(date +%Z))."
	if [[ -d /etc/logrotate.d ]]; then
		cat >/etc/logrotate.d/proem-quiz-backup <<'EOF'
/var/log/proem-quiz-backup.log {
	monthly
	rotate 6
	compress
	missingok
	notifempty
}
EOF
	fi
	command -v cron >/dev/null || command -v crond >/dev/null || warn "Nie widzę usługi cron – zainstaluj pakiet cron, inaczej kopie nie będą się robić same."
else
	warn "Brak /etc/cron.d – ustaw ręcznie uruchamianie $APP_DIR/backup.sh co noc."
fi

# --- 2. Dostęp dla NAS-a (tylko odczyt, przez rrsync) ---
bold "2/3 Dostęp dla NAS-a (NAS pobiera kopię – bez otwierania portów u Was)"
command -v rsync >/dev/null || { info "Instaluję rsync…"; (apt-get update -qq && apt-get install -y -qq rsync) >/dev/null; }
RRSYNC="$(command -v rrsync || true)"
if [[ -z "$RRSYNC" && -f /usr/share/doc/rsync/scripts/rrsync.gz ]]; then
	gunzip -c /usr/share/doc/rsync/scripts/rrsync.gz >/usr/local/bin/rrsync && chmod 755 /usr/local/bin/rrsync
	RRSYNC=/usr/local/bin/rrsync
elif [[ -z "$RRSYNC" && -f /usr/share/doc/rsync/scripts/rrsync ]]; then
	install -m 755 /usr/share/doc/rsync/scripts/rrsync /usr/local/bin/rrsync
	RRSYNC=/usr/local/bin/rrsync
fi
[[ -n "$RRSYNC" ]] || { warn "Nie znaleziono rrsync (część pakietu rsync). Przerywam."; exit 1; }

if ! id "$BACKUP_USER" >/dev/null 2>&1; then
	useradd --system --create-home --home-dir "/var/lib/$BACKUP_USER" --shell /bin/sh --gid "$QUIZ_UID" "$BACKUP_USER"
	# „*” = logowanie hasłem niemożliwe; nie „!” (konto zablokowane), bo sshd odrzuciłby wtedy także klucz.
	usermod -p '*' "$BACKUP_USER"
	info "Utworzono konto $BACKUP_USER (bez hasła, tylko klucz NAS-a)."
fi
BK_HOME="$(getent passwd "$BACKUP_USER" | cut -d: -f6)"
install -d -m 700 -o "$BACKUP_USER" -g "$QUIZ_UID" "$BK_HOME/.ssh"
AK="$BK_HOME/.ssh/authorized_keys"
if [[ -s "$AK" ]] && ! yes_no "NAS ma już klucz. Podmienić go na nowy?"; then
	info "Klucz NAS-a bez zmian."
else
	info "Na NAS-ie uruchom: bash nas-pull.sh init  – wypisze klucz publiczny (jedna linia „ssh-ed25519 …”)."
	nas_key="$(ask 'Wklej klucz publiczny NAS-a' '')"
	[[ "$nas_key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]{60,}(\ .*)?$ ]] || { warn "To nie wygląda na klucz ssh-ed25519."; exit 1; }
	# restrict: bez powłoki i przekierowań; rrsync -ro: tylko odczyt i tylko katalog danych quizu.
	printf 'command="%s -ro %s/data/",restrict %s\n' "$RRSYNC" "$APP_DIR" "$nas_key" >"$AK"
	chown "$BACKUP_USER:$QUIZ_UID" "$AK"
	chmod 600 "$AK"
	info "Klucz NAS-a zapisany (tylko odczyt $APP_DIR/data)."
fi
for t in ed25519; do
	f="/etc/ssh/ssh_host_${t}_key.pub"
	[[ -f "$f" ]] && info "Do nas-pull.sh: SERVER_FINGERPRINT=$(ssh-keygen -lf "$f" | awk '{print $2}')"
done
if grep -qiE '^\s*AllowUsers' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null; then
	warn "sshd ma ustawione AllowUsers – dopisz tam $BACKUP_USER, inaczej NAS się nie połączy."
fi

# --- 3. Dysk współdzielony Google (szyfrowany) ---
bold "3/3 Szyfrowana kopia na Dysk współdzielony Google"
CFG="$APP_DIR/backup-config"
install -d -m 700 -o root -g root "$CFG"
if [[ -f "$CFG/rclone.conf" ]] && ! yes_no "Dysk Google jest już skonfigurowany. Skonfigurować od nowa?"; then
	info "Konfiguracja Dysku bez zmian."
elif yes_no "Skonfigurować teraz kopię na Dysk Google? (wymaga konta technicznego – instrukcja w README)"; then
	if [[ ! -s "$CFG/sa.json" ]]; then
		info "Zapisz klucz konta technicznego (plik JSON z Google Cloud) jako $CFG/sa.json:"
		info "  nano $CFG/sa.json   (wklej całą zawartość pliku, zapisz), potem uruchom ten skrypt ponownie."
		exit 0
	fi
	chmod 600 "$CFG/sa.json"
	grep -q '"type": *"service_account"' "$CFG/sa.json" || { warn "$CFG/sa.json nie jest kluczem konta technicznego."; exit 1; }
	drive_id="$(ask 'ID Dysku współdzielonego (z adresu: drive.google.com/drive/folders/<ID>)' '')"
	[[ "$drive_id" =~ ^[A-Za-z0-9_-]{10,60}$ ]] || { warn "Niepoprawne ID dysku."; exit 1; }
	pass1="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
	pass2="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
	obscure() { docker run --rm --read-only --cap-drop ALL "$RCLONE_IMAGE" obscure "$1"; }
	umask 077
	cat >"$CFG/rclone.conf" <<EOF
[gdrive]
type = drive
scope = drive
service_account_file = /config/sa.json
team_drive = $drive_id
# kasowanie = przeniesienie do kosza Dysku (30 dni na odzyskanie)
use_trash = true

[gcrypt]
type = crypt
remote = gdrive:proem-quiz
filename_encryption = standard
directory_name_encryption = true
password = $(obscure "$pass1")
password2 = $(obscure "$pass2")
EOF
	chmod 600 "$CFG/rclone.conf"
	info "Test połączenia z Dyskiem…"
	if docker run --rm --read-only --tmpfs /tmp --cap-drop ALL -e RCLONE_CONFIG=/config/rclone.conf -e RCLONE_CACHE_DIR=/tmp \
		-v "$CFG:/config:ro" "$RCLONE_IMAGE" mkdir gcrypt:db; then
		info "Połączenie działa."
	else
		warn "Nie udało się połączyć z Dyskiem. Sprawdź: konto techniczne dodane do dysku jako „Menedżer treści”, ID dysku, API Dysku włączone."
	fi
	bold "ZAPISZ W MENEDŻERZE HASEŁ (bez nich kopii z Dysku nie da się odszyfrować):"
	info "Proem Quiz – szyfrowanie kopii, hasło 1: $pass1"
	info "Proem Quiz – szyfrowanie kopii, hasło 2: $pass2"
	info "(+ ID dysku: $drive_id oraz plik $CFG/sa.json)"
	read -r -p "  Naciśnij Enter, gdy zapiszesz hasła…" _ || true
	clear 2>/dev/null || true
fi

bold "Gotowe"
info "Pierwszą kopię zrób teraz:  bash $APP_DIR/backup.sh"
info "Stan kopii: panel → Ustawienia → Kopie zapasowe; log: /var/log/proem-quiz-backup.log"
