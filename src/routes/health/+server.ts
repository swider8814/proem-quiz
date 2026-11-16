import { json } from '@sveltejs/kit';
import { db, schema } from '#lib/server/db/index.js';
import { count } from 'drizzle-orm';

export function GET() {
	const [{ themes }] = db.select({ themes: count() }).from(schema.themes).all();
	return json({ ok: true, version: process.env.APP_VERSION ?? 'dev', themes, time: new Date().toISOString() });
}
