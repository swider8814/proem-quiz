// Dźwięki gry generowane w przeglądarce (Web Audio) – bez plików, bez praw autorskich.
export type PodiumSound = 'fanfare' | 'triumph' | 'drumroll' | 'custom' | 'none';
export const BUILTIN_PODIUM: PodiumSound[] = ['fanfare', 'triumph', 'drumroll'];

type Note = [freq: number, at: number, len: number];

function brass(ctx: AudioContext, out: AudioNode, notes: Note[], t0: number) {
	const lp = ctx.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.value = 2400;
	lp.connect(out);
	for (const [f, at, len] of notes) {
		for (const detune of [-6, 6]) {
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = 'sawtooth';
			o.frequency.value = f;
			o.detune.value = detune;
			const s = t0 + at;
			g.gain.setValueAtTime(0.0001, s);
			g.gain.exponentialRampToValueAtTime(0.5, s + 0.03);
			g.gain.setValueAtTime(0.5, s + len * 0.7);
			g.gain.exponentialRampToValueAtTime(0.0001, s + len);
			o.connect(g).connect(lp);
			o.start(s);
			o.stop(s + len + 0.05);
		}
	}
}

function noise(ctx: AudioContext, seconds: number) {
	const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	return buf;
}

/** Werbel (seria uderzeń szumu) od `start` do `end` i talerz w chwili `end`. */
function drumroll(ctx: AudioContext, out: AudioNode, start: number, end: number) {
	const hit = noise(ctx, 0.08);
	const bp = ctx.createBiquadFilter();
	bp.type = 'bandpass';
	bp.frequency.value = 1800;
	bp.connect(out);
	for (let t = start; t < end; t += 0.045) {
		const src = ctx.createBufferSource();
		src.buffer = hit;
		const g = ctx.createGain();
		const v = 0.15 + 0.5 * ((t - start) / Math.max(0.1, end - start)); // narasta
		g.gain.setValueAtTime(v, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
		src.connect(g).connect(bp);
		src.start(t);
	}
	const crash = ctx.createBufferSource();
	crash.buffer = noise(ctx, 2.5);
	const hp = ctx.createBiquadFilter();
	hp.type = 'highpass';
	hp.frequency.value = 3500;
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.9, end);
	g.gain.exponentialRampToValueAtTime(0.001, end + 2.4);
	crash.connect(hp).connect(g).connect(out);
	crash.start(end);
	brass(ctx, out, [[523.25, 0, 0.9], [659.25, 0, 0.9], [783.99, 0, 0.9]], end);
}

/**
 * Dźwięk na podium. `firstAt` – ms do pokazania 1. miejsca, `secondAt` – do 2. miejsca (werbel startuje wtedy).
 * Zwraca funkcję zatrzymującą (np. gdy prowadzący zamknie grę).
 */
export function playPodium(kind: PodiumSound, opts: { firstAt: number; secondAt?: number; url?: string | null }): () => void {
	if (kind === 'none') return () => {};
	if (kind === 'custom') {
		if (!opts.url) return playPodium('fanfare', opts);
		const a = new Audio(opts.url);
		a.preload = 'auto';
		const timer = setTimeout(() => a.play().catch(() => {}), opts.firstAt);
		return () => {
			clearTimeout(timer);
			a.pause();
		};
	}
	let ctx: AudioContext;
	try {
		ctx = new AudioContext();
	} catch {
		return () => {};
	}
	const out = ctx.createGain();
	out.gain.value = 0.18;
	out.connect(ctx.destination);
	const now = ctx.currentTime;
	const first = now + opts.firstAt / 1000;
	if (kind === 'fanfare') {
		brass(ctx, out, [[392, 0, 0.16], [523.25, 0.16, 0.16], [659.25, 0.32, 0.16], [783.99, 0.48, 0.5], [659.25, 0.98, 0.14], [783.99, 1.12, 0.9]], first);
	} else if (kind === 'triumph') {
		const c: Note[] = [];
		const chords: [number[], number, number][] = [
			[[261.63, 329.63, 392], 0, 0.35],
			[[293.66, 349.23, 440], 0.4, 0.35],
			[[329.63, 392, 493.88], 0.8, 0.35],
			[[349.23, 440, 523.25], 1.2, 0.5],
			[[392, 493.88, 587.33], 1.75, 0.25],
			[[523.25, 659.25, 783.99], 2.05, 1.4]
		];
		for (const [fs, at, len] of chords) for (const f of fs) c.push([f, at, len]);
		brass(ctx, out, c, first);
	} else if (kind === 'drumroll') {
		const start = now + (opts.secondAt ?? Math.max(0, opts.firstAt - 1800)) / 1000;
		drumroll(ctx, out, start, first);
	}
	const closeAt = setTimeout(() => ctx.close().catch(() => {}), opts.firstAt + 5000);
	return () => {
		clearTimeout(closeAt);
		ctx.close().catch(() => {});
	};
}
