#!/bin/bash
# Proem Quiz – pobieranie kopii zapasowej z Mikrusa NA NAS Synology (NAS łączy się sam, nic nie otwiera u Was).
#
# 1. Skopiuj ten plik na NAS, np. do /volume1/Kopie/proem-quiz/nas-pull.sh, i uzupełnij 4 wartości poniżej.
# 2. Jednorazowo (Panel sterowania → Harmonogram zadań → Utwórz → Zadanie wyzwalane/zaplanowane →
#    Skrypt zdefiniowany przez użytkownika, użytkownik: root, „Uruchom” raz):
#        bash /volume1/Kopie/proem-quiz/nas-pull.sh init
#    Wynik (zakładka „Wyniki”/e-mail) zawiera klucz publiczny – wklej go w mikrus-backup-setup.sh na serwerze.
# 3. Codzienne zadanie zaplanowane (root, np. 05:00):
#        bash /volume1/Kopie/proem-quiz/nas-pull.sh
#    i w ustawieniach zadania włącz e-mail „tylko gdy skrypt zakończy się nieprawidłowo”.
# 4. Historia 90 dni: aplikacja Snapshot Replication → migawki folderu współdzielonego „Kopie”
#    codziennie o 06:00, przechowywanie 90 dni.
set -euo pipefail

# ── Uzupełnij ────────────────────────────────────────────────────────────
SERVER_HOST="srvXX.mikr.us"            # adres Mikrusa (ten sam co MIKRUS_HOST w GitHubie)
SERVER_PORT="10123"                    # port SSH Mikrusa
SERVER_FINGERPRINT="SHA256:..."        # wypisuje go mikrus-backup-setup.sh
DEST="/volume1/Kopie/proem-quiz"       # folder na NAS-ie (wolumen Btrfs, dostęp tylko dla administratorów)
# ─────────────────────────────────────────────────────────────────────────

USER_ON_SERVER=quiz-backup
MAX_AGE_HOURS=36
SSH_DIR="$DEST/.ssh"
KEY="$SSH_DIR/id_ed25519"
KH="$SSH_DIR/known_hosts"

umask 077
mkdir -p "$SSH_DIR" "$DEST/backup"
chmod 700 "$SSH_DIR"

if [[ "$SERVER_FINGERPRINT" != SHA256:* || ${#SERVER_FINGERPRINT} -lt 40 ]]; then
	echo "Uzupełnij SERVER_HOST, SERVER_PORT, SERVER_FINGERPRINT i DEST na początku skryptu."
	exit 1
fi

pin_host() {
	# Zaufany tylko klucz serwera o podanym odcisku (ochrona przed podstawionym serwerem).
	local scanned line fp
	scanned="$(ssh-keyscan -T 15 -t ed25519 -p "$SERVER_PORT" "$SERVER_HOST" 2>/dev/null || true)"
	: >"$KH.new"
	while IFS= read -r line; do
		[[ -z "$line" || "$line" == \#* ]] && continue
		fp="$(printf '%s\n' "$line" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}')"
		[[ "$fp" == "$SERVER_FINGERPRINT" ]] && printf '%s\n' "$line" >>"$KH.new"
	done <<<"$scanned"
	if [[ ! -s "$KH.new" ]]; then
		rm -f "$KH.new"
		echo "BŁĄD: odcisk klucza serwera nie zgadza się z SERVER_FINGERPRINT (albo serwer nieosiągalny)."
		exit 1
	fi
	mv -f "$KH.new" "$KH"
}

if [[ "${1:-}" == "init" ]]; then
	[[ -f "$KEY" ]] || ssh-keygen -q -t ed25519 -N "" -C "nas-proem-quiz" -f "$KEY"
	pin_host
	echo "Serwer rozpoznany (odcisk się zgadza)."
	echo "Klucz publiczny NAS-a – wklej go w mikrus-backup-setup.sh na serwerze:"
	cat "$KEY.pub"
	exit 0
fi

[[ -f "$KEY" && -s "$KH" ]] || { echo "Najpierw uruchom: bash $0 init"; exit 1; }

SSH="ssh -i $KEY -p $SERVER_PORT -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KH -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=30"
# Serwer udostępnia tylko odczyt katalogu danych quizu. Pobieramy wyłącznie katalog kopii: bazy i migawki
# plików z tej samej chwili (twarde dowiązania – -H zachowuje je, więc pliki zajmują miejsce raz).
RSYNC=(rsync -rtH --delete --timeout=600 --chmod=Du=rwx,Dgo=,Fu=rw,Fgo= -e "$SSH")

echo "$(date -Iseconds) Pobieranie kopii (baza + pliki)…"
"${RSYNC[@]}" "$USER_ON_SERVER@$SERVER_HOST:backup/" "$DEST/backup/"

# Kontrola: najnowsza kopia bazy jest świeża, wygląda na bazę SQLite i ma swoją migawkę plików.
newest="$(ls -1t "$DEST"/backup/quiz-*.db 2>/dev/null | head -1 || true)"
if [[ -z "$newest" ]]; then
	echo "BŁĄD: brak kopii bazy na serwerze."
	exit 1
fi
age_h=$(( ($(date +%s) - $(stat -c %Y "$newest")) / 3600 ))
if (( age_h > MAX_AGE_HOURS )); then
	echo "BŁĄD: najnowsza kopia ($newest) ma ${age_h} h – sprawdź kopie na serwerze."
	exit 1
fi
if [[ "$(head -c 15 "$newest")" != "SQLite format 3" ]]; then
	echo "BŁĄD: $newest nie wygląda na bazę danych."
	exit 1
fi
snap="$DEST/backup/$(basename "$newest" .db | sed 's/^quiz-/media-/')"
if [[ ! -d "$snap" ]]; then
	echo "BŁĄD: brak migawki plików $snap dla $(basename "$newest")."
	exit 1
fi
echo "$(date -Iseconds) OK: $(basename "$newest") (${age_h} h), plików w migawce: $(find "$snap" -type f | wc -l)"
