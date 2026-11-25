// Zapora kontenera (scripts/mikrus-firewall.sh): plan bez zmian, apply/remove w osobnej przestrzeni sieciowej
// (unshare -n – reguły nie dotykają systemu, na którym biegnie test). Bez uprawnień root – tylko plan.
//   node tests/firewall.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { finish, ok } from './_helpers.mjs';

const script = path.resolve('scripts/mikrus-firewall.sh');
const run = (args, env = {}) => spawnSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, APP_DIR: '/nieistnieje', ...env } });

const plan = run(['plan', '--cytrus', '1.2.3.4', '--port', '3100']);
ok(plan.status === 0 && /PLAN \(nic nie zmieniam\)/.test(plan.stdout), 'plan: tylko wypisuje reguły');
ok(/-i br-proem-quiz -j PQ-INPUT/.test(plan.stdout) && /PQ-EGRESS -d 172\.16\.0\.0\/12 -j DROP/.test(plan.stdout), 'plan: blokada hosta i sieci prywatnych');
ok(/--ctorigdstport 3100 -j PQ-INGRESS/.test(plan.stdout) && /PQ-INGRESS -s 1\.2\.3\.4 -j RETURN/.test(plan.stdout), 'plan: port quizu tylko od Cytrusa');
ok(run(['plan', '--cytrus', '1.2.3.4;rm -rf /']).status === 2, 'zły adres Cytrusa odrzucony');
ok(run(['plan', '--port', '80; reboot']).status === 2, 'zły port odrzucony');
ok(!/-j PQ-INGRESS/.test(run(['plan']).stdout), 'bez --cytrus brak reguły dla portu');

const canNs = process.getuid?.() === 0 && spawnSync('unshare', ['-n', 'iptables', '-S'], { encoding: 'utf8' }).status === 0;
if (!canNs) {
	console.log('(apply/remove pominięte: potrzebny root i unshare)');
} else {
	const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-fw-'));
	fs.writeFileSync(path.join(fake, 'ip'), '#!/bin/sh\nexit 0\n', { mode: 0o755 }); // mostek „istnieje”
	const r = spawnSync('unshare', ['-n', 'bash', '-c', `
		set -e
		iptables -N DOCKER-USER; iptables -A FORWARD -j DOCKER-USER; iptables -A DOCKER-USER -j RETURN
		iptables -A INPUT -p tcp --dport 22 -j ACCEPT   # „cudza” reguła – musi zostać
		bash ${script} apply --cytrus 1.2.3.4 --port 3100 >/dev/null
		bash ${script} apply --cytrus 1.2.3.4 --port 3100 >/dev/null
		echo ===APPLY; iptables -S
		bash ${script} remove >/dev/null
		echo ===REMOVE; iptables -S
	`], { encoding: 'utf8', env: { ...process.env, PATH: `${fake}:${process.env.PATH}`, APP_DIR: '/nieistnieje' } });
	const [, applied, removed] = r.stdout.split(/===APPLY|===REMOVE/);
	ok(r.status === 0, `apply/remove w osobnej przestrzeni sieciowej (${r.stderr.trim()})`);
	ok((applied.match(/-j PQ-INPUT/g) ?? []).length === 1 && (applied.match(/-j PQ-EGRESS/g) ?? []).length === 1 && (applied.match(/-j PQ-INGRESS/g) ?? []).length === 1, 'apply dwa razy = reguły raz (bez duplikatów)');
	ok(!/PQ-/.test(removed) && /--dport 22 -j ACCEPT/.test(removed) && /-A DOCKER-USER -j RETURN/.test(removed), 'remove usuwa tylko reguły quizu');
	fs.rmSync(fake, { recursive: true, force: true });
}
process.exit(finish() ? 1 : 0);
