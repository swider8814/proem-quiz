// Wspólne narzędzia testów: osobny proces serwera na tymczasowych danych + prosty klient HTTP z ciasteczkami.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Czeka, aż SvelteKit skończy hydratację bieżącego dokumentu (znacznik z src/routes/+layout.svelte). */
export function hydrated(page, timeout = 30000) {
	return page.waitForSelector('html[data-hydrated]', { state: 'attached', timeout });
}

/**
 * Po każdym page.goto / page.waitForURL czeka dodatkowo na hydratację. Bez tego na wolnej maszynie
 * (CI, 1 rdzeń) test klika w przycisk, zanim Svelte podepnie obsługę zdarzeń.
 */
export function waitForHydration(page) {
	const goto = page.goto.bind(page);
	const waitForURL = page.waitForURL.bind(page);
	page.goto = async (...args) => {
		const res = await goto(...args);
		await hydrated(page);
		return res;
	};
	page.waitForURL = async (...args) => {
		await waitForURL(...args);
		await hydrated(page);
	};
	return page;
}

let fails = 0;
export function ok(cond, msg) {
	process.stderr.write(`${cond ? '✔' : '✘'} ${msg}\n`);
	if (!cond) fails++;
}
export function finish() {
	process.stderr.write(fails ? `\n${fails} BŁĘDÓW\n` : '\nWszystko OK\n');
	return fails;
}

const freePort = () =>
	new Promise((r) => {
		const s = net.createServer().listen(0, '127.0.0.1', () => {
			const p = s.address().port;
			s.close(() => r(p));
		});
	});

/** Uruchamia zbudowany serwer (npm run build) w osobnym procesie. */
export async function startServer(extraEnv = {}, opts = {}) {
	const port = await freePort();
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-test-'));
	const host = opts.host ?? '127.0.0.1'; // adres inny niż localhost = jak w sieci Wi-Fi (niezaufany origin http)
	const base = `http://${host}:${port}`;
	const env = {
		...process.env,
		NODE_ENV: 'production',
		PORT: String(port),
		HOST: host === '127.0.0.1' ? '127.0.0.1' : '0.0.0.0',
		ORIGIN: base,
		DATA_DIR: dataDir,
		TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
		BODY_SIZE_LIMIT: '36M', // jak w Dockerfile
		...extraEnv
	};
	const proc = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
	let log = '';
	proc.stdout.on('data', (d) => (log += d));
	proc.stderr.on('data', (d) => (log += d));
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(`${base}/health`)).ok) break;
		} catch {}
		await sleep(100);
	}
	const cli = (...args) => execFileSync(process.execPath, ['server/cli.js', ...args], { env, encoding: 'utf8' });
	return {
		base,
		port,
		dataDir,
		env,
		proc,
		log: () => log,
		alive: () => proc.exitCode === null && proc.signalCode === null,
		cli,
		stop: () => {
			proc.kill('SIGKILL');
			fs.rmSync(dataDir, { recursive: true, force: true });
		}
	};
}

/** Klient przeglądarkowy: ciasteczka, Origin, Accept: text/html. */
export class Browser {
	constructor(base) {
		this.base = base;
		this.jar = {};
	}
	clone() {
		const b = new Browser(this.base);
		b.jar = { ...this.jar };
		return b;
	}
	cookieHeader() {
		return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
	}
	async req(p, { method = 'GET', form, body, headers = {}, raw = false } = {}) {
		const h = { accept: 'text/html', cookie: this.cookieHeader(), origin: this.base, ...headers };
		if (form) h['content-type'] = 'application/x-www-form-urlencoded';
		const res = await fetch(this.base + p, {
			method,
			redirect: 'manual',
			headers: h,
			body: form ? new URLSearchParams(form) : body
		});
		const setCookies = res.headers.getSetCookie();
		for (const c of setCookies) {
			const [kv] = c.split(';');
			const i = kv.indexOf('=');
			const k = kv.slice(0, i);
			const v = kv.slice(i + 1);
			if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(c) || v === '') delete this.jar[k];
			else this.jar[k] = v;
		}
		return { status: res.status, loc: res.headers.get('location'), headers: res.headers, setCookies, text: raw ? null : await res.text(), res };
	}
}

/** Admin z hasłem i (opcjonalnie) skonfigurowanym TOTP. Zwraca { browser, secret, email, password }. */
export async function makeAdmin(srv, email, { totp = true } = {}) {
	const { generate } = await import('otplib');
	const out = srv.cli('create-admin', email, 'Test Admin');
	const link = out.match(/\/invite\/[A-Za-z0-9_-]+/)[0];
	const b = new Browser(srv.base);
	const password = 'BardzoTajne123!';
	await b.req(link, { method: 'POST', form: { password, repeat: password } });
	if (!totp) return { browser: b, email, password, secret: null };
	const page = await b.req('/panel/2fa-setup');
	const secret = page.text.match(/<code class="copy[^>]*>([A-Z2-7 ]+)<\/code>/)[1].replace(/ /g, '');
	await b.req('/panel/2fa-setup', { method: 'POST', form: { code: await generate({ secret }) } });
	return { browser: b, email, password, secret };
}

/** Autor zaproszony przez admina (bez TOTP). */
export async function makeAuthor(srv, admin, email) {
	const r = await admin.req('/panel/users?/invite', { method: 'POST', form: { name: email.split('@')[0], email, role: 'author' } });
	const link = r.text.match(/\/invite\/[A-Za-z0-9_-]+/)[0];
	const b = new Browser(srv.base);
	await b.req(link, { method: 'POST', form: { password: 'AutorHaslo123!', repeat: 'AutorHaslo123!' } });
	return b;
}

/** Krótki plik MP3 (ffmpeg). */
export function makeMp3(seconds = 3) {
	const f = path.join(os.tmpdir(), `pq-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
	execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-b:a', '64k', f]);
	const data = fs.readFileSync(f);
	fs.rmSync(f);
	return data;
}

export async function upload(browser, data, name = 'plik.mp3') {
	const fd = new FormData();
	fd.append('file', new Blob([data]), name);
	return browser.req('/panel/api/media', { method: 'POST', body: fd, headers: { accept: 'application/json' } });
}
