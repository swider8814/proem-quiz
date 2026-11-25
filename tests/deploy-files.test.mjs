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

const wf = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
ok(!/scp-action|ssh-action/.test(wf), 'deploy nie kopiuje plików ani nie uruchamia dowolnych komend na serwerze');
ok(/StrictHostKeyChecking=yes/.test(wf) && /MIKRUS_SSH_FINGERPRINT/.test(wf), 'deploy weryfikuje odcisk klucza serwera');

process.exit(finish() ? 1 : 0);
