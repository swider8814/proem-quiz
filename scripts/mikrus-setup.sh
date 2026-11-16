#!/usr/bin/env bash
# Proem Quiz – jednorazowe przygotowanie Mikrusa (kroki 1–4 z README).
# Uruchom na serwerze jako root:   bash mikrus-setup.sh
# Po pierwszym deployu (GitHub Actions):   bash mikrus-setup.sh admin jan@proem.pl "Jan Kowalski"
# Skrypt można uruchamiać wielokrotnie – niczego nie nadpisuje bez pytania.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/proem-quiz}"
APP_UID=1000 # użytkownik aplikacji w kontenerze

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

# --- 1. Docker ---
bold "1/4 Docker"
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

# --- 2. Katalog i .env ---
bold "2/4 Katalog $APP_DIR i plik .env"
mkdir -p "$APP_DIR/data"
chown -R "$APP_UID:$APP_UID" "$APP_DIR/data"
chmod 700 "$APP_DIR/data"
info "Dane aplikacji: $APP_DIR/data (właściciel uid $APP_UID)"

ENV_FILE="$APP_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
	info ".env już istnieje – zostawiam bez zmian (edycja: nano $ENV_FILE)."
else
	info "Port: jeden z portów TCP przydzielonych Twojemu Mikrusowi (panel Mikrusa)."
	port="$(ask 'Port aplikacji' '')"
	[[ "$port" =~ ^[0-9]{2,5}$ ]] || { warn "Niepoprawny port."; exit 1; }
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
EOF
	chmod 600 "$ENV_FILE"
	info "Zapisano $ENV_FILE (tylko root może go czytać)."
	warn "TOTP_ENCRYPTION_KEY w tym pliku jest niezbędny do logowania z 2FA – nie zmieniaj go i miej kopię."
fi

# --- 3. Klucz SSH dla GitHub Actions ---
bold "3/4 Klucz SSH dla GitHub Actions"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
if grep -q 'github-actions-proem-quiz' ~/.ssh/authorized_keys; then
	info "Klucz dla GitHub Actions jest już dodany."
	if yes_no "Wygenerować NOWY klucz (stary zostanie usunięty, trzeba podmienić sekret MIKRUS_SSH_KEY)?"; then
		sed -i '/github-actions-proem-quiz/d' ~/.ssh/authorized_keys
	else
		SKIP_KEY=1
	fi
fi
if [[ -z "${SKIP_KEY:-}" ]]; then
	tmp="$(mktemp -d)"
	trap 'rm -rf "$tmp"' EXIT
	ssh-keygen -q -t ed25519 -N "" -C github-actions-proem-quiz -f "$tmp/key"
	cat "$tmp/key.pub" >>~/.ssh/authorized_keys
	info "Skopiuj CAŁY poniższy blok (z liniami BEGIN/END) do sekretu MIKRUS_SSH_KEY:"
	echo
	cat "$tmp/key"
	echo
	rm -rf "$tmp"
	info "Klucz prywatny nie został zapisany na serwerze – jeśli go zgubisz, uruchom skrypt ponownie."
fi

# --- 4. Wartości sekretów ---
bold "4/4 Sekrety w GitHubie (repo → Settings → Secrets and variables → Actions)"
info "MIKRUS_HOST            = adres serwera z panelu Mikrusa (np. srv12.mikr.us); ta maszyna: $(hostname)"
info "MIKRUS_SSH_PORT        = port SSH z panelu Mikrusa"
info "MIKRUS_USER            = $(id -un)"
info "MIKRUS_SSH_KEY         = blok z kroku 3"
for t in ed25519 ecdsa rsa; do
	f="/etc/ssh/ssh_host_${t}_key.pub"
	[[ -f "$f" ]] || continue
	info "MIKRUS_SSH_FINGERPRINT = $(ssh-keygen -lf "$f" | awk '{print $2}')   (klucz $t$([[ $t == ed25519 ]] && echo ', użyj tego'))"
done

bold "Dalej"
info "5. GitHub → Actions → „Build i deploy” → Run workflow."
info "6. Po zielonym deployu utwórz konto administratora:"
info "     bash $0 admin twoj@email.pl \"Imię Nazwisko\""
info "7. Cytrus: domena → http://<adres serwera>:<PORT>, potem test: https://<domena>/test-ws"
