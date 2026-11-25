#!/usr/bin/env bash
# Proem Quiz – zapora dla kontenera quizu na Mikrusie (iptables, tylko IPv4 – sieć quizu nie ma IPv6).
#
# Po co: nawet gdyby ktoś przejął aplikację quizu, kontener NIE może łączyć się z serwerem
# (porty hosta: SSH, bazy, panel app.proem.pl) ani z innymi kontenerami / sieciami prywatnymi.
# Może tylko odpowiadać graczom i wychodzić do internetu (np. serwer poczty).
# Opcjonalnie: port quizu przyjmuje połączenia tylko od Cytrusa (--cytrus ADRES).
#
#   bash mikrus-firewall.sh                 # PLAN: pokazuje reguły, NICZEGO nie zmienia
#   bash mikrus-firewall.sh apply [--cytrus 1.2.3.4[,5.6.7.8]] [--port 3000]
#   bash mikrus-firewall.sh test            # sprawdza z wnętrza kontenera, czy blokada działa
#   bash mikrus-firewall.sh status | remove
#   bash mikrus-firewall.sh install         # apply po każdym starcie Dockera (usługa systemd)
#
# Reguły są w osobnych łańcuchach PQ-* (dodawane raz, usuwane w całości) – nie ruszamy reguł innych usług.
set -euo pipefail

BRIDGE="${PQ_BRIDGE:-br-proem-quiz}"   # stała nazwa mostka z docker-compose.yml (com.docker.network.bridge.name)
APP_DIR="${APP_DIR:-/srv/proem-quiz}"
IPT="${IPTABLES:-iptables}"
MODE="${1:-plan}"
shift || true
CYTRUS=""
PORT=""
while [[ $# -gt 0 ]]; do
	case "$1" in
		--cytrus) CYTRUS="${2:-}"; shift 2 ;;
		--port) PORT="${2:-}"; shift 2 ;;
		*) echo "Nieznana opcja: $1"; exit 2 ;;
	esac
done
if [[ -z "$PORT" && -f "$APP_DIR/.env" ]]; then PORT="$(sed -n 's/^PORT=\([0-9]\{1,5\}\)$/\1/p' "$APP_DIR/.env" | tail -n 1)"; fi
PORT="${PORT:-3000}"
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] || { echo "Zły port: $PORT"; exit 2; }
if [[ -n "$CYTRUS" ]]; then
	IFS=',' read -r -a CYTRUS_LIST <<<"$CYTRUS"
	for a in "${CYTRUS_LIST[@]}"; do
		[[ "$a" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}(/[0-9]{1,2})?$ ]] || { echo "Zły adres Cytrusa (IPv4 lub CIDR): $a"; exit 2; }
	done
fi

PRIVATE=(10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 127.0.0.0/8)

# Plan reguł: jedna linia = jedno wywołanie iptables (bez -t = tabela filter).
rules() {
	# 1. Kontener → host: żadnych NOWYCH połączeń do usług serwera (odpowiedzi na ruch przychodzący przechodzą).
	echo "-N PQ-INPUT"
	echo "-A PQ-INPUT -i $BRIDGE -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN"
	echo "-A PQ-INPUT -i $BRIDGE -j DROP"
	echo "-I INPUT 1 -i $BRIDGE -j PQ-INPUT"
	# 2. Kontener → inne kontenery i sieci prywatne (także porty innych usług po przekierowaniu Dockera).
	echo "-N PQ-EGRESS"
	echo "-A PQ-EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN"
	for net in "${PRIVATE[@]}"; do echo "-A PQ-EGRESS -d $net -j DROP"; done
	echo "-I DOCKER-USER 1 -i $BRIDGE -j PQ-EGRESS"
	# 3. (opcjonalnie) Port quizu z internetu tylko przez Cytrusa.
	if [[ -n "$CYTRUS" ]]; then
		echo "-N PQ-INGRESS"
		for a in "${CYTRUS_LIST[@]}"; do echo "-A PQ-INGRESS -s $a -j RETURN"; done
		echo "-A PQ-INGRESS -j DROP"
		echo "-I DOCKER-USER 1 -o $BRIDGE -p tcp -m conntrack --ctstate NEW --ctorigdstport $PORT -j PQ-INGRESS"
	fi
}

has_chain() { "$IPT" -S "$1" >/dev/null 2>&1; }

remove() {
	# Odpięcie skoków i usunięcie łańcuchów PQ-* (bez dotykania czegokolwiek innego).
	for spec in "INPUT -i $BRIDGE -j PQ-INPUT" "DOCKER-USER -i $BRIDGE -j PQ-EGRESS"; do
		read -r -a s <<<"$spec"
		while "$IPT" -C "${s[@]}" 2>/dev/null; do "$IPT" -D "${s[@]}"; done
	done
	if has_chain DOCKER-USER; then
		local jumps
		jumps="$("$IPT" -S DOCKER-USER | grep -- '-j PQ-INGRESS' | sed 's/^-A /-D /' || true)"
		while read -r line; do
			[[ -n "$line" ]] || continue
			read -r -a s <<<"$line"
			"$IPT" "${s[@]}"
		done <<<"$jumps"
	fi
	for c in PQ-INPUT PQ-EGRESS PQ-INGRESS; do
		if has_chain "$c"; then "$IPT" -F "$c" && "$IPT" -X "$c"; fi
	done
}

preflight() {
	[[ $EUID -eq 0 ]] || { echo "Uruchom jako root."; exit 1; }
	"$IPT" -S INPUT >/dev/null 2>&1 || { echo "iptables niedostępne na tym serwerze – zapory nie da się tak ustawić (napisz do Daniela)."; exit 1; }
	has_chain DOCKER-USER || { echo "Brak łańcucha DOCKER-USER – czy Docker działa?"; exit 1; }
	ip link show "$BRIDGE" >/dev/null 2>&1 || { echo "Brak mostka $BRIDGE – uruchom quiz (docker compose up -d) z aktualnym docker-compose.yml."; exit 1; }
}

case "$MODE" in
	plan)
		echo "PLAN (nic nie zmieniam). Mostek: $BRIDGE, port quizu: $PORT${CYTRUS:+, Cytrus: $CYTRUS}"
		rules | sed "s/^/  $IPT /"
		echo "Zastosuj: bash $0 apply${CYTRUS:+ --cytrus $CYTRUS}"
		;;
	apply)
		preflight
		remove
		rules | while read -r line; do
			read -r -a s <<<"$line"
			"$IPT" "${s[@]}"
		done
		echo "Zapora quizu włączona. Sprawdź: bash $0 test   (i czy app.proem.pl działa)"
		;;
	remove)
		preflight
		remove
		echo "Zapora quizu wyłączona."
		;;
	status)
		for c in PQ-INPUT PQ-EGRESS PQ-INGRESS; do has_chain "$c" && "$IPT" -S "$c" || echo "($c: brak)"; done
		"$IPT" -S INPUT | grep PQ- || true
		"$IPT" -S DOCKER-USER | grep PQ- || true
		;;
	test)
		# Z wnętrza kontenera: host i sieci prywatne mają być NIEOSIĄGALNE, internet osiągalny.
		gw="$(docker network inspect proem-quiz-net -f '{{(index .IPAM.Config 0).Gateway}}')"
		probe() {
			docker exec proem-quiz node -e "const s=require('net').connect({host:process.argv[1],port:+process.argv[2],timeout:3000});s.on('connect',()=>{console.log('OTWARTE');process.exit(0)});s.on('timeout',()=>{console.log('ZABLOKOWANE');process.exit(0)});s.on('error',e=>{console.log(e.code==='ECONNREFUSED'?'ODMOWA (host odpowiada!)':'ZABLOKOWANE');process.exit(0)})" "$1" "$2"
		}
		echo "Kontener → host $gw:22 (SSH):        $(probe "$gw" 22)"
		echo "Kontener → host $gw:80:              $(probe "$gw" 80)"
		echo "Kontener → internet 1.1.1.1:443:     $(probe 1.1.1.1 443)"
		echo "Oczekiwane: dwa razy ZABLOKOWANE, internet OTWARTE."
		;;
	install)
		preflight
		install -m 755 "$0" /usr/local/sbin/proem-quiz-firewall
		cat >/etc/systemd/system/proem-quiz-firewall.service <<EOF
[Unit]
Description=Proem Quiz – zapora kontenera quizu
# PartOf + WantedBy=docker.service: restart lub ponowny start Dockera (np. aktualizacja pakietu)
# zakłada reguły od nowa – zapora nie znika po cichu do następnego restartu serwera.
After=docker.service
PartOf=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
# Mostek powstaje razem z kontenerem – czekamy na niego do 2 minut.
ExecStartPre=/bin/sh -c 'for i in \$(seq 60); do ip link show $BRIDGE >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1'
ExecStart=/usr/local/sbin/proem-quiz-firewall apply${CYTRUS:+ --cytrus $CYTRUS} --port $PORT
ExecStop=/usr/local/sbin/proem-quiz-firewall remove

[Install]
WantedBy=multi-user.target docker.service
EOF
		systemctl daemon-reload
		# reenable: przy aktualizacji z wersji z Requires= odświeża dowiązania [Install].
		systemctl reenable proem-quiz-firewall.service
		systemctl restart proem-quiz-firewall.service
		systemctl is-active --quiet proem-quiz-firewall.service || { echo "BŁĄD: usługa zapory nie wystartowała – systemctl status proem-quiz-firewall"; exit 1; }
		echo "Usługa proem-quiz-firewall włączona (po restarcie serwera zapora wraca sama)."
		;;
	*)
		echo "Użycie: $0 [plan|apply|test|status|remove|install] [--cytrus ADRES[,ADRES]] [--port PORT]"
		exit 2
		;;
esac
