// Zdjęcie z telefonu: duży JPEG (> dawny limit 5 MB) z obrotem w EXIF. Przeglądarka zmniejsza je
// przed wysłaniem i obraca według EXIF; na serwerze obraz ma orientację pionową i najwyżej 1600 px.
//   node tests/photo-upload.e2e.mjs   (wymaga npm run build i ffmpeg)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-photo-'));
const raw = path.join(tmp, 'raw.jpg');
// 4000×3000 z szumem (duży plik jak z aparatu): lewa połowa czerwona, prawa niebieska.
execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=2000x3000', '-f', 'lavfi', '-i', 'color=blue:s=2000x3000',
	'-filter_complex', '[0][1]hstack,noise=alls=60:allf=u,format=yuvj444p', '-frames:v', '1', '-q:v', '1', raw]);
// Segment EXIF z Orientation=6 (aparat trzymany pionowo: obrót o 90° w prawo przy wyświetlaniu).
const tiff = Buffer.from('4d4d002a00000008' + '0001' + '011200030000000100060000' + '00000000', 'hex');
const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
const jpg = fs.readFileSync(raw);
const photo = path.join(tmp, 'IMG_1234.jpg');
fs.writeFileSync(photo, Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]));
const size = fs.statSync(photo).size;

const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
	ok(size > 5 * 1024 * 1024, `plik testowy większy niż dawny limit 5 MB (${(size / 1048576).toFixed(1)} MB)`);
	const { browser: admin } = await makeAdmin(srv, 'foto@proem.pl');
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const p = waitForHydration(await ctx.newPage());
	// Rozmiar pliku faktycznie wysłanego przez przeglądarkę (pole „file” w FormData).
	await p.addInitScript(() => {
		const orig = window.fetch;
		window.fetch = (input, init) => {
			if (init?.body instanceof FormData && init.body.get('file') instanceof File) window.__sentBytes = init.body.get('file').size;
			return orig(input, init);
		};
	});
	await p.goto(`${srv.base}/panel`);
	await p.fill('input[name="title"]', 'Zdjęcia');
	await p.click('button:has-text("Utwórz quiz")');
	await p.waitForURL(/\/panel\/quizzes\/quiz_/);
	await p.selectOption('select[aria-label="Typ nowego pytania"]', 'choice');
	await p.click('button:has-text("+ Dodaj pytanie")');
	await p.setInputFiles('.image input[type="file"]', photo);
	await p.waitForSelector('.image img', { timeout: 60000 });
	ok(!(await p.isVisible('.image .error')), 'zdjęcie wgrane bez błędu');
	const sent = await p.evaluate(() => window.__sentBytes ?? 0);
	ok(sent > 0 && sent < 3 * 1024 * 1024, `przeglądarka wysłała zmniejszony plik (${(sent / 1048576).toFixed(2)} MB zamiast ${(size / 1048576).toFixed(1)} MB)`);
	const dims = await p.$eval('.image img', async (img) => {
		await img.decode();
		const c = document.createElement('canvas');
		c.width = img.naturalWidth; c.height = img.naturalHeight;
		const g = c.getContext('2d');
		g.drawImage(img, 0, 0);
		const [r, , b] = g.getImageData(Math.floor(c.width / 2), 5, 1, 1).data;
		return { w: img.naturalWidth, h: img.naturalHeight, topRed: r > 150 && b < 100 };
	});
	ok(dims.h > dims.w && Math.max(dims.w, dims.h) <= 1600, `na serwerze pionowo i najwyżej 1600 px (${dims.w}×${dims.h})`);
	ok(dims.topRed, 'obrót według EXIF: czerwona połowa jest u góry');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
	fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(finish() ? 1 : 0);
