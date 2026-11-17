export type QType = 'choice' | 'truefalse' | 'audio' | 'text' | 'order';

export type QData =
	| { type: 'choice'; answers: string[]; correct: number[] }
	| { type: 'truefalse'; correct: boolean; thumbs?: boolean }
	| { type: 'audio'; answers: string[]; correct: number[]; audioMediaId: string; startMs: number; endMs: number; loop: boolean; revealEndMs: number | null }
	| { type: 'text'; accepted: string[]; typoTolerance: 0 | 1 | 2 }
	| { type: 'order'; items: string[]; partialCredit: boolean };

export type EditorQuestion = {
	key: string; // klucz lokalny (stabilny dla {#each})
	id?: string;
	type: QType;
	prompt: string;
	promptTranslation: string | null;
	imageMediaId: string | null;
	timeLimit: number;
	pointsMultiplier: 0 | 1 | 2;
	data: QData;
};

export const QTYPES: QType[] = ['choice', 'truefalse', 'audio', 'text', 'order'];

export const ANSWER_COLORS = ['#ff5d8f', '#3d7bff', '#ffc93c', '#2ec27e'];

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export function blankData(type: QType): QData {
	switch (type) {
		case 'choice': return { type, answers: ['', '', '', ''], correct: [0] };
		case 'truefalse': return { type, correct: true };
		case 'audio': return { type, answers: ['', '', '', ''], correct: [0], audioMediaId: '', startMs: 0, endMs: 10_000, loop: false, revealEndMs: null };
		case 'text': return { type, accepted: [''], typoTolerance: 1 };
		case 'order': return { type, items: ['', '', ''], partialCredit: false };
	}
}

/** Domyślna treść pytania audio w języku quizu. */
const AUDIO_PROMPT: Record<string, string> = { pl: 'Jaka to piosenka?', en: 'Name that song!', uk: 'Що це за пісня?' };

export function newQuestion(type: QType, timeLimit: number, locale = 'pl'): EditorQuestion {
	return {
		key: newKey(),
		type,
		prompt: type === 'audio' ? (AUDIO_PROMPT[locale] ?? AUDIO_PROMPT.pl) : '',
		promptTranslation: null,
		imageMediaId: null,
		timeLimit: type === 'order' || type === 'text' ? Math.max(timeLimit, 30) : timeLimit,
		pointsMultiplier: 1,
		data: blankData(type)
	};
}

/** Zmiana typu z zachowaniem tego, co się da (odpowiedzi ABCD <-> audio). */
export function changeType(q: EditorQuestion, type: QType): EditorQuestion {
	const d = blankData(type);
	if ((q.data.type === 'choice' || q.data.type === 'audio') && (d.type === 'choice' || d.type === 'audio')) {
		d.answers = [...q.data.answers];
		d.correct = [...q.data.correct];
	}
	return { ...q, type, data: d };
}

export type Problem = 'prompt' | 'answers' | 'emptyCorrect' | 'audio' | 'accepted' | 'items';

/** Szybka walidacja w przeglądarce (serwer i tak sprawdza wszystko). Zwraca klucze – tekst z i18n/panel.ts. */
export function problems(q: EditorQuestion): Problem[] {
	const out: Problem[] = [];
	if (!q.prompt.trim()) out.push('prompt');
	const d = q.data;
	if (d.type === 'choice' || d.type === 'audio') {
		if (d.answers.filter((a) => a.trim()).length < 2) out.push('answers');
		if (d.answers.some((a, i) => !a.trim() && d.correct.includes(i))) out.push('emptyCorrect');
	}
	if (d.type === 'audio' && !d.audioMediaId) out.push('audio');
	if (d.type === 'text' && !d.accepted.some((a) => a.trim())) out.push('accepted');
	if (d.type === 'order' && d.items.filter((a) => a.trim()).length < 3) out.push('items');
	return out;
}

/** Dane do wysłania: usuwa puste odpowiedzi i przelicza indeksy poprawnych. */
export function toPayload(q: EditorQuestion) {
	let data: QData = q.data;
	if (data.type === 'choice' || data.type === 'audio') {
		const keep = data.answers.map((a, i) => ({ a: a.trim(), i })).filter((x) => x.a);
		const correct = keep.map((x, newIdx) => ((data as { correct: number[] }).correct.includes(x.i) ? newIdx : -1)).filter((i) => i >= 0);
		data = { ...data, answers: keep.map((x) => x.a), correct };
	}
	if (data.type === 'text') data = { ...data, accepted: data.accepted.map((a) => a.trim()).filter(Boolean) };
	if (data.type === 'order') data = { ...data, items: data.items.map((a) => a.trim()).filter(Boolean) };
	return {
		id: q.id,
		type: q.type,
		prompt: q.prompt.trim(),
		promptTranslation: q.promptTranslation?.trim() || null,
		imageMediaId: q.imageMediaId,
		timeLimit: q.timeLimit,
		pointsMultiplier: q.pointsMultiplier,
		data
	};
}

export async function uploadFile(file: File, fallbackError = 'Upload failed.'): Promise<{ id: string; kind: 'audio' | 'image'; name: string; durationMs: number | null; url: string }> {
	const fd = new FormData();
	fd.append('file', file);
	const res = await fetch('/panel/api/media', { method: 'POST', body: fd });
	const body = await res.json().catch(() => ({ error: fallbackError }));
	if (!res.ok) throw new Error(body.error ?? body.message ?? fallbackError);
	return body;
}

export const fmtTime = (ms: number) => {
	const s = Math.max(0, ms) / 1000;
	return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

export function parseTime(v: string): number | null {
	const m = v.trim().match(/^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/);
	if (!m) return null;
	return Math.round(((m[1] ? parseInt(m[1]) * 60 : 0) + parseFloat(m[2].replace(',', '.'))) * 1000);
}
