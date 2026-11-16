import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema.js';

const dataDir = process.env.DATA_DIR ?? path.resolve('data');
fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true });

const sqlite = new Database(path.join(dataDir, 'quiz.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// W dev migracje uruchamiamy tutaj; w produkcji robi to server/index.js przed startem.
if (process.env.NODE_ENV !== 'production') {
	migrate(db, { migrationsFolder: path.resolve('drizzle') });
}
export { schema };
export const mediaDir = path.join(dataDir, 'media');
