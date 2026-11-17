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

// ── Muzyka w tle (poczekalnia, odliczanie, pytania) ─────────────────────
export type MusicKind = 'calm' | 'upbeat' | 'custom' | 'none';
export const BUILTIN_MUSIC: MusicKind[] = ['calm', 'upbeat'];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// Akordy (MIDI) – prosta, ciepła progresja I–V–vi–IV w C-dur.
const PROGRESSION = [
	[60, 64, 67],
	[55, 59, 62],
	[57, 60, 64],
	[53, 57, 60]
];

/** Muzyka w pętli: wbudowana (syntezator, planowana z wyprzedzeniem) albo własny plik. */
export class Music {
	private ctx: AudioContext | null = null;
	private out: GainNode | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private next = 0;
	private step = 0;
	private audio: HTMLAudioElement | null = null;
	private current = '';

	/** Włącza muzykę (ta sama już grająca – bez restartu). */
	play(kind: MusicKind, url?: string | null, volume = 1) {
		const id = `${kind}:${url ?? ''}`;
		if (this.current === id) return;
		this.stop();
		if (kind === 'none') return;
		this.current = id;
		if (kind === 'custom') {
			if (!url) return;
			this.audio = new Audio(url);
			this.audio.loop = true;
			this.audio.volume = 0.5 * volume;
			this.audio.play().catch(() => {});
			return;
		}
		try {
			this.ctx = new AudioContext();
		} catch {
			return;
		}
		const ctx = this.ctx;
		this.out = ctx.createGain();
		this.out.gain.setValueAtTime(0.0001, ctx.currentTime);
		this.out.gain.exponentialRampToValueAtTime(0.09 * volume, ctx.currentTime + 1.2);
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = kind === 'calm' ? 1600 : 3200;
		this.out.connect(lp).connect(ctx.destination);
		this.next = ctx.currentTime + 0.1;
		this.step = 0;
		const beat = kind === 'calm' ? 0.42 : 0.24; // długość ósemki (s)
		const schedule = () => {
			if (!this.ctx || !this.out) return;
			while (this.next < this.ctx.currentTime + 0.6) {
				this.note(kind, this.step, this.next, beat);
				this.next += beat;
				this.step++;
			}
		};
		schedule();
		this.timer = setInterval(schedule, 150);
	}

	private note(kind: MusicKind, step: number, t: number, beat: number) {
		const ctx = this.ctx!;
		const out = this.out!;
		const chord = PROGRESSION[Math.floor(step / 8) % PROGRESSION.length];
		const pos = step % 8;
		// Arpeggio (góra akordu, oktawę wyżej)
		const arp = [0, 1, 2, 1, 0, 1, 2, 1][pos];
		this.tone(midi(chord[arp] + 12), t, beat * 0.9, kind === 'calm' ? 'triangle' : 'square', kind === 'calm' ? 0.5 : 0.25, out);
		// Bas na raz i trzy
		if (pos === 0 || pos === 4) this.tone(midi(chord[0] - 12), t, beat * 3.5, 'sine', 0.9, out);
		// Lekki rytm w wersji „żywej”
		if (kind === 'upbeat' && (pos === 2 || pos === 6)) this.tick(t, out);
	}

	private tone(f: number, t: number, len: number, type: OscillatorType, vol: number, out: AudioNode) {
		const ctx = this.ctx!;
		const o = ctx.createOscillator();
		const g = ctx.createGain();
		o.type = type;
		o.frequency.value = f;
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
		g.gain.exponentialRampToValueAtTime(0.0001, t + len);
		o.connect(g).connect(out);
		o.start(t);
		o.stop(t + len + 0.05);
	}

	private tick(t: number, out: AudioNode) {
		const ctx = this.ctx!;
		const src = ctx.createBufferSource();
		src.buffer = noise(ctx, 0.05);
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 6000;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.35, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
		src.connect(hp).connect(g).connect(out);
		src.start(t);
	}

	/** Przeglądarka wstrzymuje dźwięk do pierwszego kliknięcia na stronie – wznawiamy wtedy. */
	resume() {
		if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
		if (this.audio?.paused) this.audio.play().catch(() => {});
	}

	stop() {
		this.current = '';
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		if (this.audio) {
			const a = this.audio;
			this.audio = null;
			a.pause();
		}
		if (this.ctx && this.out) {
			const ctx = this.ctx;
			try {
				this.out.gain.cancelScheduledValues(ctx.currentTime);
				this.out.gain.setValueAtTime(this.out.gain.value, ctx.currentTime);
				this.out.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
			} catch {
				/* kontekst zamknięty */
			}
			setTimeout(() => ctx.close().catch(() => {}), 700);
		}
		this.ctx = null;
		this.out = null;
	}
}
