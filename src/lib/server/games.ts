import type { GameReportData } from './db/schema.js';

export type GameReportInput = { quizId: string; title: string; startedAt: number; endedAt: number; data: GameReportData };

// Dostęp do rejestru gier (ten sam obiekt, którego używa serwer Socket.IO – globalThis).
type Registry = {
	create(quiz: unknown, ownerId: string, opts?: { onEnd?: (report: GameReportInput) => void }): { pin: string; hostToken: string };
	get(pin: string): { ownerId: string; state: string; currentPublicMedia(): string[] } | null;
};

export function games(): Registry {
	const r = (globalThis as { __proemQuizGames?: Registry }).__proemQuizGames;
	if (!r) throw new Error('Serwer gry nie jest uruchomiony');
	return r;
}
