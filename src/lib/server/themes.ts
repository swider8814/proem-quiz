import { z } from 'zod';
import { asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { newId } from './auth/crypto.js';
import type { ThemeColors, ThemeStyle } from './db/schema.js';

export const FONTS = ['Archivo', 'Montserrat', 'Plus Jakarta Sans', 'Inter'] as const;

/** Kolory startowe dla każdego stylu (te same co w motywach Proem). */
export const STYLE_PRESETS: Record<ThemeStyle, { colors: ThemeColors; font: (typeof FONTS)[number] }> = {
	poster: { font: 'Archivo', colors: { background: '#dff1ff', surface: '#ffffff', text: '#111111', accent: '#ffc93c', answers: ['#ff5d8f', '#3d7bff', '#ffc93c', '#2ec27e'] } },
	vivid: { font: 'Montserrat', colors: { background: '#2a1a5e', surface: '#ffffff', text: '#ffffff', accent: '#ffd23f', answers: ['#e21b3c', '#1368ce', '#d89e00', '#26890c'] } },
	calm: { font: 'Plus Jakarta Sans', colors: { background: '#f3f5fa', surface: '#ffffff', text: '#17203a', accent: '#1f4fd1', answers: ['#d7263d', '#1f4fd1', '#b26b00', '#1b7a3a'] } }
};

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hexColor');
const mediaId = z.string().regex(/^med_[A-Za-z0-9_-]{10,20}$/).nullable();

export const themeSchema = z.object({
	name: z.string().trim().min(2, 'themeName').max(60),
	style: z.enum(['poster', 'vivid', 'calm']),
	headingFont: z.enum(FONTS),
	colors: z.object({ background: hex, surface: hex, text: hex, accent: hex, answers: z.tuple([hex, hex, hex, hex]) }),
	logoLight: mediaId,
	logoDark: mediaId
});

export const listThemes = () => db.select().from(schema.themes).orderBy(asc(schema.themes.name)).all();
export const getTheme = (id: string) => db.select().from(schema.themes).where(eq(schema.themes.id, id)).get() ?? null;

function slugify(name: string) {
	const base = name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'motyw';
	let slug = base;
	for (let i = 2; db.select().from(schema.themes).where(eq(schema.themes.slug, slug)).get(); i++) slug = `${base}-${i}`;
	return slug;
}

export function createTheme(name: string, style: ThemeStyle) {
	const p = STYLE_PRESETS[style];
	const id = newId('theme');
	db.insert(schema.themes).values({ id, slug: slugify(name), name: name.trim().slice(0, 60), style, colors: p.colors, headingFont: p.font }).run();
	return id;
}

/** Logo musi być istniejącym obrazkiem (PNG/JPG/WEBP/GIF – bez SVG). */
function validImage(id: string | null) {
	if (!id) return true;
	return db.select({ kind: schema.media.kind }).from(schema.media).where(eq(schema.media.id, id)).get()?.kind === 'image';
}

export function updateTheme(id: string, input: z.infer<typeof themeSchema>) {
	if (!getTheme(id)) return { error: 'Nie znaleziono motywu.' };
	if (!validImage(input.logoLight) || !validImage(input.logoDark)) return { error: 'logoImage' as const };
	db.update(schema.themes)
		.set({ name: input.name, style: input.style, headingFont: input.headingFont, colors: input.colors, logoLight: input.logoLight, logoDark: input.logoDark })
		.where(eq(schema.themes.id, id))
		.run();
	return { ok: true };
}

export function setDefaultTheme(id: string) {
	if (!getTheme(id)) return false;
	db.transaction(() => {
		db.update(schema.themes).set({ isDefault: false }).run();
		db.update(schema.themes).set({ isDefault: true }).where(eq(schema.themes.id, id)).run();
	});
	return true;
}

/** Usunięcie motywu: quizy z tym motywem przechodzą na motyw domyślny. Domyślnego nie da się usunąć. */
export function deleteTheme(id: string) {
	const t = getTheme(id);
	if (!t) return { error: 'Nie znaleziono motywu.' };
	if (t.isDefault) return { error: 'deleteDefaultTheme' as const };
	const def = db.select().from(schema.themes).where(eq(schema.themes.isDefault, true)).get();
	db.transaction(() => {
		db.update(schema.quizzes).set({ themeId: def?.id ?? null }).where(eq(schema.quizzes.themeId, id)).run();
		db.delete(schema.themes).where(eq(schema.themes.id, id)).run();
	});
	return { ok: true };
}

export function themeUsage(): Map<string, number> {
	const out = new Map<string, number>();
	for (const q of db.select({ t: schema.quizzes.themeId }).from(schema.quizzes).all()) if (q.t) out.set(q.t, (out.get(q.t) ?? 0) + 1);
	return out;
}

// ── Ustawienia organizacji ───────────────────────────────────────────────

export function getSettings() {
	const rows = db.select().from(schema.appSettings).where(inArray(schema.appSettings.key, ['org_name', 'org_logo_media_id'])).all();
	const m = new Map(rows.map((r) => [r.key, r.value]));
	return { orgName: m.get('org_name') ?? 'Proem', orgLogo: m.get('org_logo_media_id') ?? null };
}

export function saveSettings(orgName: string, orgLogo: string | null) {
	if (orgLogo && !validImage(orgLogo)) return { error: 'logoImage' as const };
	db.transaction(() => {
		db.insert(schema.appSettings).values({ key: 'org_name', value: orgName }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value: orgName } }).run();
		if (orgLogo) {
			db.insert(schema.appSettings).values({ key: 'org_logo_media_id', value: orgLogo }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value: orgLogo } }).run();
		} else {
			db.delete(schema.appSettings).where(eq(schema.appSettings.key, 'org_logo_media_id')).run();
		}
	});
	return { ok: true };
}
