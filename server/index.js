// Serwer produkcyjny: SvelteKit (adapter-node) + Socket.IO w jednym procesie.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { attachRealtime } from './realtime.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '::'; // :: = IPv4 + IPv6 (Mikrus ma IPv6)
const DATA_DIR = process.env.DATA_DIR ?? path.resolve('data');

// 1. Migracje bazy przed startem.
fs.mkdirSync(path.join(DATA_DIR, 'media'), { recursive: true });
const sqlite = new Database(path.join(DATA_DIR, 'quiz.db'));
sqlite.pragma('journal_mode = WAL');
migrate(drizzle(sqlite), { migrationsFolder: path.resolve('drizzle') });
sqlite.close();

// 2. SvelteKit + Socket.IO.
const { handler } = await import('../build/handler.js');
const server = http.createServer(handler);
attachRealtime(server);

const onListening = () => {
	const a = /** @type {import('node:net').AddressInfo} */ (server.address());
	console.log(`Proem Quiz działa na ${a.address}:${a.port}`);
};
server.once('error', (err) => {
	// Brak IPv6 na maszynie -> słuchamy na samym IPv4.
	if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EAFNOSUPPORT' && HOST === '::') {
		server.listen(PORT, '0.0.0.0', onListening);
	} else throw err;
});
server.listen(PORT, HOST, onListening);

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
