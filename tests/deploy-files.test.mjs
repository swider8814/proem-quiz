// Pliki wdrożenia: docker-compose.yml w repo = wersja zapisywana przez scripts/mikrus-setup.sh,
// skrypty mają poprawną składnię, a compose zawiera izolację od innych usług na serwerze.
//   node tests/deploy-files.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { finish, ok } from './_helpers.mjs';

const setup = fs.readFileSync('scripts/mikrus-setup.sh', 'utf8');
const heredoc = (tag) => {
	const m = setup.match(new RegExp(`<<'${tag}'\\n([\\s\\S]*?)\\n${tag}\\n`));
	return m ? m[1] + '\n' : null;
};

const compose = heredoc('COMPOSE_EOF');
ok(compose === fs.readFileSync('docker-compose.yml', 'utf8'), 'docker-compose.yml w repo jest identyczny z wersją ze skryptu');

for (const rule of ['name: proem-quiz', 'read_only: true', 'cap_drop: [ALL]', 'no-new-privileges:true', 'pids_limit:', 'mem_limit:', 'cpus:', 'user: "${QUIZ_UID', '- ./data:/data']) {
	ok(compose?.includes(rule), `compose zawiera: ${rule}`);
}
ok(!/\/var\/run\/docker\.sock|privileged|network_mode:\s*host|pid:\s*host/.test(compose ?? ''), 'compose bez dostępu do Dockera hosta, trybu uprzywilejowanego i sieci hosta');
const volBlock = (compose ?? '').match(/\n    volumes:\n((?:      .*\n)+)/)?.[1] ?? '';
const volumes = [...volBlock.matchAll(/^\s+- ([^:\s#]+):/gm)].map((m) => m[1]);
ok(volumes.length === 1 && volumes[0] === './data', `jedyny montowany katalog to ./data (${volumes.join(', ')})`);

const deploy = heredoc('DEPLOY_EOF');
ok(!!deploy, 'skrypt zawiera deploy.sh');
ok(deploy?.includes('DOCKER_CONFIG='), 'deploy.sh używa osobnych danych logowania Dockera');
ok(!/docker (system|container|volume|network) prune|docker rm |docker stop /.test(deploy ?? ''), 'deploy.sh nie zatrzymuje ani nie usuwa cudzych kontenerów');
ok(/prune -f --filter "label=org\.opencontainers\.image\.source=https:\/\/github\.com\/swider8814\/proem-quiz"/.test(deploy ?? ''), 'deploy.sh usuwa tylko obrazy quizu');
ok(/command="%s",restrict/.test(setup), 'klucz GitHuba ograniczony do deploy.sh (restrict)');
ok(/OLD_DIR="\$HOME\/proem-quiz"/.test(setup) && /exit 1/.test(setup.split('OLD_DIR=')[1] ?? ''), 'stara instalacja w ~/proem-quiz wykrywana – bez drugiej, pustej instalacji (review Codexa #5)');
ok(/\^command=\\"\$DEPLOY\\",/.test(setup), 'klucz GitHuba wskazujący inny deploy.sh jest wymieniany');
for (const key of ['QUIZ_UID', 'QUIZ_MEM', 'QUIZ_CPUS', 'MEDIA_QUOTA_BYTES', 'MEDIA_MIN_FREE_BYTES']) {
	ok(new RegExp(`ensure_env ${key} `).test(setup), `${key} dopisywany także do istniejącego .env (review Codexa #4)`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-deploy-'));
for (const [name, body] of [['setup.sh', setup], ['deploy.sh', deploy ?? '']]) {
	const f = path.join(tmp, name);
	fs.writeFileSync(f, body);
	let syntax = true;
	try {
		execFileSync('bash', ['-n', f], { stdio: 'pipe' });
	} catch {
		syntax = false;
	}
	ok(syntax, `${name}: poprawna składnia bash`);
}
fs.rmSync(tmp, { recursive: true, force: true });

// ── Kopie zapasowe ──
const bsetup = fs.readFileSync('scripts/mikrus-backup-setup.sh', 'utf8');
const backupSh = bsetup.match(/<<'BACKUP_EOF'\n([\s\S]*?)\nBACKUP_EOF\n/)?.[1] ?? '';
ok(/command="%s -ro %s\/data\/",restrict/.test(bsetup), 'klucz NAS-a: tylko odczyt katalogu danych (rrsync -ro, restrict)');
ok(!/passwd -l/.test(bsetup) && /usermod -p '\*'/.test(bsetup), 'konto kopii bez hasła, ale nie zablokowane (sshd przyjmie klucz)');
ok(/--read-only/.test(backupSh) && /--cap-drop ALL --cap-add DAC_READ_SEARCH/.test(backupSh) && /data:\/data:ro/.test(backupSh), 'rclone w zamkniętym kontenerze, dane tylko do odczytu');
ok(/install -d -m 700 -o root -g root "\$CFG"/.test(bsetup), 'konfiguracja Dysku (klucze, hasła) dostępna tylko dla roota');
ok(/use_trash = true/.test(bsetup), 'kasowanie na Dysku przez kosz');
const backupCode = backupSh.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
ok(!/\b(find|rm|mv|mktemp|chmod|chown|install|touch|ln)\b[^\n]*data/.test(backupCode) && !/>\s*"?data\//.test(backupCode), 'backup.sh (root) nie zapisuje ani nie kasuje niczego w katalogu danych');
{
	const fw = fs.readFileSync('scripts/mikrus-firewall.sh', 'utf8');
	const bridge = fw.match(/BRIDGE="\$\{PQ_BRIDGE:-([a-z-]+)\}"/)?.[1];
	ok(!!bridge && fs.readFileSync('docker-compose.yml', 'utf8').includes(`com.docker.network.bridge.name: ${bridge}`), `zapora i compose: ta sama nazwa mostka (${bridge})`);
}
{
	const wf = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
	const dep = wf.slice(wf.indexOf('\n  deploy:'));
	ok(/if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/.test(dep.split('\n').slice(0, 6).join('\n')), 'deploy na serwer tylko ręcznie (Run workflow na main), nie przy scaleniu PR-a');
}
const nas = fs.readFileSync('scripts/nas-pull.sh', 'utf8');
ok(/StrictHostKeyChecking=yes/.test(nas) && /SERVER_FINGERPRINT/.test(nas), 'NAS weryfikuje odcisk klucza serwera');
for (const [name, body] of [['mikrus-backup-setup.sh', bsetup], ['backup.sh', backupSh], ['nas-pull.sh', nas]]) {
	const f = path.join(os.tmpdir(), `pq-syntax-${name}`);
	fs.writeFileSync(f, body);
	let good = true;
	try { execFileSync('bash', ['-n', f], { stdio: 'pipe' }); } catch { good = false; }
	fs.rmSync(f, { force: true });
	ok(good, `${name}: poprawna składnia bash`);
}

// Pliki, do których odsyła README, są w repozytorium (nie ignorowane przez .gitignore) – review Codexa #5
for (const f of ['.env.example', '.env.local.example', 'docker-compose.local.yml', 'scripts/nas-pull.sh', 'scripts/mikrus-backup-setup.sh', 'scripts/mikrus-firewall.sh']) {
	let tracked = true;
	try { execFileSync('git', ['ls-files', '--error-unmatch', f], { stdio: 'pipe' }); } catch { tracked = false; }
	ok(tracked, `${f} jest w repozytorium`);
}

const wf = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
ok(!/scp-action|ssh-action/.test(wf), 'deploy nie kopiuje plików ani nie uruchamia dowolnych komend na serwerze');
ok(/StrictHostKeyChecking=yes/.test(wf) && /MIKRUS_SSH_FINGERPRINT/.test(wf), 'deploy weryfikuje odcisk klucza serwera');

process.exit(finish() ? 1 : 0);
