export type QType = 'choice' | 'truefalse' | 'audio' | 'text' | 'order';

export type QData =
	| { type: 'choice'; answers: string[]; correct: number[] }
	| { type: 'truefalse'; correct: boolean }
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

export const TYPE_LABELS: Record<QType, string> = {
	choice: 'Wybór (ABCD)',
	truefalse: 'Prawda / fałsz',
	audio: 'Audio – jaka to piosenka?',
	text: 'Wpisywana odpowiedź',
	order: 'Ułóż w kolejności'
};

export const TYPE_SHORT: Record<QType, string> = {
	choice: 'ABCD',
	truefalse: 'P/F',
	audio: 'AUDIO',
	text: 'TEKST',
	order: 'KOLEJN.'
};

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

export function newQuestion(type: QType, timeLimit: number): EditorQuestion {
	return {
		key: newKey(),
		type,
		prompt: type === 'audio' ? 'Jaka to piosenka?' : '',
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

/** Szybka walidacja w przeglądarce (serwer i tak sprawdza wszystko). */
export function problems(q: EditorQuestion): string[] {
	const out: string[] = [];
	if (!q.prompt.trim()) out.push('brak treści pytania');
	const d = q.data;
	if (d.type === 'choice' || d.type === 'audio') {
		if (d.answers.filter((a) => a.trim()).length < 2) out.push('min. 2 odpowiedzi');
		if (d.answers.some((a, i) => !a.trim() && d.correct.includes(i))) out.push('poprawna odpowiedź jest pusta');
	}
	if (d.type === 'audio' && !d.audioMediaId) out.push('brak pliku audio');
	if (d.type === 'text' && !d.accepted.some((a) => a.trim())) out.push('brak akceptowanej odpowiedzi');
	if (d.type === 'order' && d.items.filter((a) => a.trim()).length < 3) out.push('min. 3 elementy');
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

export async function uploadFile(file: File): Promise<{ id: string; kind: 'audio' | 'image'; name: string; durationMs: number | null; url: string }> {
	const fd = new FormData();
	fd.append('file', file);
	const res = await fetch('/panel/api/media', { method: 'POST', body: fd });
	const body = await res.json().catch(() => ({ error: 'Błąd wysyłania pliku.' }));
	if (!res.ok) throw new Error(body.error ?? body.message ?? 'Błąd wysyłania pliku.');
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
