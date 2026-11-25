// Dźwięki gry: wbudowane nagrania z /static/sounds (prawa po stronie fundacji) albo własny plik quizu.

// ── Dźwięk na podium ─────────────────────────────────────────────────────
export type PodiumSound = 'fanfare' | 'triumph' | 'drumroll' | 'custom' | 'none';
export const BUILTIN_PODIUM: PodiumSound[] = ['fanfare', 'triumph', 'drumroll'];

const podiumFile = (kind: PodiumSound) => `/sounds/podium-${kind}.mp3`;

/**
 * Gra dźwięk podium. firstAt – chwila pokazania zwycięzcy (ms od teraz).
 * Werble zaczynają od razu (narastają do zwycięzcy), fanfary i własny plik – w chwili zwycięzcy.
 */
export function playPodium(kind: PodiumSound, opts: { firstAt: number; url?: string | null }): () => void {
	if (kind === 'none') return () => {};
	const url = kind === 'custom' ? opts.url : podiumFile(kind);
	if (!url) return playPodium('fanfare', opts);
	const a = new Audio(url);
	a.preload = 'auto';
	a.volume = 0.9;
	const startIn = kind === 'drumroll' ? 0 : opts.firstAt;
	const timer = setTimeout(() => a.play().catch(() => {}), startIn);
	return () => {
		clearTimeout(timer);
		a.pause();
	};
}

// ── Muzyka w tle (cały quiz w pętli) ─────────────────────────────────────
export type MusicKind = 'lounge' | 'elevator' | 'background' | 'onhold' | 'christmas' | 'custom' | 'none' | 'calm' | 'upbeat';
export const BUILTIN_MUSIC = ['lounge', 'elevator', 'background', 'onhold', 'christmas'] as const;

/** Dawne nazwy (muzyka z syntezatora) → nagrania. */
export const musicKind = (k: MusicKind | undefined): MusicKind => (k === 'calm' ? 'background' : k === 'upbeat' ? 'lounge' : (k ?? 'background'));

/** Muzyka w pętli: wbudowane nagranie albo własny plik. Ta sama muzyka nie startuje od nowa. */
export class Music {
	private audio: HTMLAudioElement | null = null;
	private current = '';
	private fade: ReturnType<typeof setInterval> | null = null;

	play(kind: MusicKind, url?: string | null, volume = 1) {
		const k = musicKind(kind);
		const src = k === 'custom' ? url : k === 'none' ? null : `/sounds/music-${k}.mp3`;
		const id = src ?? '';
		const target = 0.45 * volume;
		if (this.current === id && this.audio) {
			if (this.fade) clearInterval(this.fade);
			this.fade = null;
			this.audio.volume = target;
			if (this.audio.paused) this.audio.play().catch(() => {});
			return;
		}
		this.stop();
		if (!src) return;
		this.current = id;
		this.audio = new Audio(src);
		this.audio.loop = true;
		this.audio.volume = target;
		this.audio.play().catch(() => {});
	}

	/** Przeglądarka wstrzymuje dźwięk do pierwszego kliknięcia na stronie – wznawiamy wtedy. */
	resume() {
		if (this.audio?.paused) this.audio.play().catch(() => {});
	}

	/** Pauza z łagodnym wyciszeniem; play() tej samej muzyki wznawia od tego miejsca. */
	pause() {
		const a = this.audio;
		if (!a || a.paused) return;
		if (this.fade) clearInterval(this.fade);
		const step = a.volume / 10;
		this.fade = setInterval(() => {
			if (a.volume - step <= 0.01) {
				if (this.fade) clearInterval(this.fade);
				this.fade = null;
				a.pause();
				return;
			}
			a.volume -= step;
		}, 40);
	}

	stop() {
		if (this.fade) clearInterval(this.fade);
		this.fade = null;
		this.current = '';
		if (this.audio) {
			this.audio.pause();
			this.audio = null;
		}
	}
}
