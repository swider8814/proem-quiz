// Raporty z gier: zapis po zakończeniu gry, lista i podgląd w panelu, eksport CSV, usuwanie po 90 dniach.
import { and, desc, eq, lt } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { newId } from './auth/crypto.js';
import type { GameReportInput } from './games.js';

export const REPORT_RETENTION_DAYS = 90;

export function saveReport(hostId: string, r: GameReportInput): string | null {
	// Gra bez graczy niczego nie mówi – nie zapisujemy pustych raportów.
	if (!r.data.players.length) return null;
	const quiz = db.select({ id: schema.quizzes.id }).from(schema.quizzes).where(eq(schema.quizzes.id, r.quizId)).get();
	if (!quiz) return null; // quiz usunięty w trakcie gry
	const id = newId('rep');
	db.insert(schema.gameReports)
		.values({
			id,
			quizId: r.quizId,
			hostId,
			title: r.title.slice(0, 120),
			playerCount: r.data.players.length,
			startedAt: new Date(r.startedAt),
			endedAt: new Date(r.endedAt),
			data: r.data
		})
		.run();
	return id;
}

export function listReports(quizId: string) {
	return db
		.select({ id: schema.gameReports.id, title: schema.gameReports.title, playerCount: schema.gameReports.playerCount, startedAt: schema.gameReports.startedAt, endedAt: schema.gameReports.endedAt, hostId: schema.gameReports.hostId })
		.from(schema.gameReports)
		.where(eq(schema.gameReports.quizId, quizId))
		.orderBy(desc(schema.gameReports.endedAt))
		.all();
}

export function getReport(quizId: string, id: string) {
	return db
		.select()
		.from(schema.gameReports)
		.where(and(eq(schema.gameReports.quizId, quizId), eq(schema.gameReports.id, id)))
		.get();
}

export function deleteReport(quizId: string, id: string) {
	return db.delete(schema.gameReports).where(and(eq(schema.gameReports.quizId, quizId), eq(schema.gameReports.id, id))).run().changes > 0;
}

/** Usuwa raporty starsze niż 90 dni (wywoływane razem ze sprzątaniem plików). */
export function sweepOldReports(): number {
	const cutoff = new Date(Date.now() - REPORT_RETENTION_DAYS * 24 * 3600 * 1000);
	return db.delete(schema.gameReports).where(lt(schema.gameReports.endedAt, cutoff)).run().changes;
}

/** Komórka CSV: cudzysłowy + ochrona przed formułami w Excelu (=, +, -, @ na początku). */
function cell(v: string | number | null | undefined): string {
	let s = v == null ? '' : String(v);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Starsze raporty zawierały przebieg odpowiedzi każdego gracza (poprawność, punkty i czas na pytanie).
 * Przycina je do nicku, miejsca i punktów. Idempotentne – wywoływane przy starcie serwera.
 */
export function stripLegacyReportDetails(): number {
	let changed = 0;
	const rows = db.select({ id: schema.gameReports.id, data: schema.gameReports.data }).from(schema.gameReports).all();
	db.transaction((tx) => {
		for (const r of rows) {
			const players = r.data?.players ?? [];
			if (!players.some((p) => Object.keys(p).some((k) => k !== 'nick' && k !== 'score' && k !== 'rank'))) continue;
			const data = { ...r.data, players: players.map((p) => ({ nick: p.nick, score: p.score, rank: p.rank })) };
			tx.update(schema.gameReports).set({ data }).where(eq(schema.gameReports.id, r.id)).run();
			changed++;
		}
	});
	return changed;
}

export type CsvLabels = {
	place: string; player: string; score: string;
	question: string; type: string; answeredCount: string; correctCount: string; wrongCount: string; avgTime: string;
	types: Record<string, string>;
};

/** CSV dla Excela (średniki, BOM UTF-8): miejsce, nick i punkty graczy, potem zbiorcze statystyki pytań. */
export function reportCsv(r: NonNullable<ReturnType<typeof getReport>>, L: CsvLabels): string {
	const d = r.data;
	const rows: string[] = [];
	rows.push([L.place, L.player, L.score].map(cell).join(';'));
	for (const p of d.players) rows.push([p.rank, p.nick, p.score].map(cell).join(';'));
	rows.push('');
	rows.push([L.question, L.type, L.answeredCount, L.correctCount, L.wrongCount, L.avgTime].map(cell).join(';'));
	d.questions.forEach((q, i) => {
		rows.push([`${i + 1}. ${q.prompt}`, L.types[q.type] ?? q.type, q.answered, q.correct, q.wrong, q.avgMs == null ? '' : (q.avgMs / 1000).toFixed(1).replace('.', ',')].map(cell).join(';'));
	});
	return '﻿' + rows.join('\r\n') + '\r\n';
}
