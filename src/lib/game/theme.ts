export type GameTheme = {
	name?: string;
	style: 'poster' | 'vivid' | 'calm';
	colors: { background: string; surface: string; text: string; accent: string; answers: string[] };
	headingFont?: string;
	logoUrl?: string | null;
	logoDarkUrl?: string | null;
} | null;

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const safe = (c: string | undefined, fallback: string) => (c && HEX.test(c) ? c : fallback);

/** Zmienne CSS z motywu. Tylko kolory w formacie #hex (żadnego dowolnego CSS z bazy). */
export function themeVars(theme: GameTheme): string {
	if (!theme) return '';
	const c = theme.colors;
	const a = c.answers ?? [];
	return [
		`--bg:${safe(c.background, '#dff1ff')}`,
		`--surface:${safe(c.surface, '#ffffff')}`,
		`--text:${safe(c.text, '#111111')}`,
		`--accent:${safe(c.accent, '#ffc93c')}`,
		`--a0:${safe(a[0], '#ff5d8f')}`,
		`--a1:${safe(a[1], '#3d7bff')}`,
		`--a2:${safe(a[2], '#ffc93c')}`,
		`--a3:${safe(a[3], '#2ec27e')}`
	].join(';');
}

export const styleOf = (theme: GameTheme) => theme?.style ?? 'poster';

/** Kolor kształtu na kaflu: na jasnych kaflach (styl C, B) ciemny, w stylu A biały. */
export const shapeColor = (style: string) => (style === 'vivid' ? '#ffffff' : '#111111');
