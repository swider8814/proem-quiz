// Ochrona po odtworzeniu bazy z kopii zapasowej.
//
// Kopie robione przez `cli.js backup` nie zawierają sesji ani nieużytych linków jednorazowych. Starsze
// kopie (sprzed tej zmiany – lokalnie, na NAS-ie i na Dysku przez 90 dni) je zawierają: po odtworzeniu
// link aktywacji albo resetu hasła zużyty PO wykonaniu kopii znów by zadziałał, do swojego terminu.
//
// Wykrywanie: licznik startów aplikacji zapisany w bazie (app_settings.db_generation) i obok niej
// w pliku data/db-generation. Plik nie jest częścią kopii bazy, więc po podmianie quiz.db na starszą
// kopię licznik w bazie jest mniejszy niż w pliku (albo go brak) – wtedy unieważniamy sesje i nieużyte
// linki jednorazowe. Pierwszy start (brak pliku) to zwykła instalacja albo pierwsze wdrożenie tej zmiany.
import fs from 'node:fs';
import path from 'node:path';
import { eq, isNull } from 'drizzle-orm';
import { dataDir, db, schema } from './db/index.js';

const KEY = 'db_generation';

export function guardRestoredDb(): { restored: boolean; sessions: number; links: number } {
	const file = path.join(dataDir, 'db-generation');
	let onDisk: number | null = null;
	let raw: string | null = null;
	try {
		raw = fs.readFileSync(file, 'utf8').trim();
	} catch (e) {
		// Tylko BRAK pliku oznacza pierwszy start. Inny błąd odczytu (uprawnienia, katalog zamiast pliku)
		// przerywa start – inaczej odtworzona baza nie zostałaby wykryta, a ślad nadpisany.
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
	}
	if (raw !== null) {
		if (!/^\d+$/.test(raw)) throw new Error(`Nieprawidłowa zawartość ${file} – nie da się sprawdzić, czy baza nie jest odtworzoną kopią`);
		onDisk = Number(raw);
	}
	// Najpierw baza (unieważnienie + nowy licznik) w jednej transakcji – jej błąd przerywa start aplikacji.
	const result = db.transaction((tx) => {
		const row = tx.select().from(schema.appSettings).where(eq(schema.appSettings.key, KEY)).get();
		const inDb = row && /^\d+$/.test(row.value) ? Number(row.value) : 0;
		const restored = onDisk !== null && inDb < onDisk;
		let sessions = 0;
		let links = 0;
		if (restored) {
			sessions = tx.delete(schema.sessions).run().changes;
			links = tx.delete(schema.invites).where(isNull(schema.invites.usedAt)).run().changes;
		}
		const next = String(Math.max(inDb, onDisk ?? 0) + 1);
		tx.insert(schema.appSettings).values({ key: KEY, value: next }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value: next } }).run();
		return { restored, sessions, links, next };
	});
	// Potem plik – już PO zatwierdzeniu unieważnienia. Gdy zapis pliku się nie uda (brak miejsca, uprawnienia),
	// unieważnienie i tak zostało zapisane, a licznik w bazie jest większy niż w pliku – kolejny start nie
	// uzna tej bazy za odtworzoną. Błąd przerywa start (lepiej nie wystartować, niż działać bez ochrony).
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, result.next, { mode: 0o640 });
	fs.renameSync(tmp, file);
	return { restored: result.restored, sessions: result.sessions, links: result.links };
}
