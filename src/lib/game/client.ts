// Wspólne drobiazgi po stronie przeglądarki (gracz + prowadzący).
import { io, type Socket } from 'socket.io-client';

export function gameSocket(auth?: Record<string, unknown>): Socket {
	return io('/game', {
		path: '/socket.io',
		auth,
		reconnection: true,
		reconnectionDelay: 500,
		reconnectionDelayMax: 3000,
		timeout: 8000
	});
}

/** Emit z odpowiedzią i limitem czasu (np. przy słabym zasięgu). */
export function ask<T = Record<string, unknown>>(socket: Socket, event: string, arg?: unknown, ms = 8000): Promise<T> {
	return new Promise((resolve) => {
		const t = setTimeout(() => resolve({ error: 'timeout' } as T), ms);
		socket.emit(event, arg, (res: T) => {
			clearTimeout(t);
			resolve(res);
		});
	});
}

/**
 * Powrót gracza do gry po odświeżeniu strony (zmiana Wi-Fi, powrót z blokady ekranu).
 * Token kasujemy TYLKO, gdy serwer jednoznacznie odpowie, że sesji już nie ma (`no-session`).
 * Przy przejściowych problemach – brak odpowiedzi (`timeout`), chwilowy limit (`rate-limited`) –
 * token zostaje, a próba jest ponawiana z rosnącą przerwą. Bez tego gracz tracił dostęp do wyniku.
 * Domyślne próby trwają łącznie ~80 s, czyli dłużej niż okno limitów serwera (60 s, `LIMITS` w
 * server/realtime.js) – po wyczerpanym limicie ostatnie próby trafiają już w nowe okno.
 * `shouldStop` przerywa ponawianie (wynik 'cancelled'), np. gdy gracz w międzyczasie sam wpisał PIN.
 */
export async function resumePlayer(
	rejoin: () => Promise<{ ok?: boolean; error?: string }>,
	forget: () => void,
	{
		attempts = 8,
		delayMs = 1500,
		maxDelayMs = 20_000,
		shouldStop = () => false,
		sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
	}: { attempts?: number; delayMs?: number; maxDelayMs?: number; shouldStop?: () => boolean; sleep?: (ms: number) => Promise<void> } = {}
): Promise<'ok' | 'gone' | 'failed' | 'cancelled'> {
	for (let i = 0; i < attempts; i++) {
		if (shouldStop()) return 'cancelled';
		const r = await rejoin();
		if (shouldStop()) return r.ok ? 'ok' : 'cancelled';
		if (r.ok) return 'ok';
		if (r.error === 'no-session') {
			forget();
			return 'gone';
		}
		if (r.error === 'already-joined') return 'failed'; // to połączenie gra już kimś innym – nie ponawiamy
		if (i < attempts - 1) await sleep(Math.min(delayMs * 2 ** i, maxDelayMs));
	}
	return 'failed';
}

const store = {
	get(k: string) {
		try {
			return localStorage.getItem(k);
		} catch {
			return null;
		}
	},
	set(k: string, v: string) {
		try {
			localStorage.setItem(k, v);
		} catch {
			/* tryb prywatny Safari itp. */
		}
	},
	del(k: string) {
		try {
			localStorage.removeItem(k);
		} catch {
			/* nic */
		}
	}
};
export { store };

export function deviceId(): string {
	let id = store.get('pq:device');
	if (!id) {
		const b = new Uint8Array(16);
		crypto.getRandomValues(b);
		id = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
		store.set('pq:device', id);
	}
	return id;
}

/** Ekran nie gaśnie w trakcie gry (tam, gdzie przeglądarka pozwala). */
/*
 * Pełny ekran: standardowe API + starsze Safari na iPadzie (webkit*). iPhone nie pozwala na pełny
 * ekran strony – wtedy canFullscreen() zwraca false i przycisk się chowa (na iPadzie i tak najlepiej
 * działa „Do ekranu początkowego”, patrz static/manifest.webmanifest).
 */
type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

export function canFullscreen(): boolean {
	const d = document as FsDoc;
	return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function toggleFullscreen(): void {
	const d = document as FsDoc;
	const el = document.documentElement as FsEl;
	try {
		if (d.fullscreenElement || d.webkitFullscreenElement) {
			if (d.exitFullscreen) d.exitFullscreen().catch(() => {});
			else d.webkitExitFullscreen?.();
		} else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
		else el.webkitRequestFullscreen?.();
	} catch {
		/* przeglądarka odmówiła – zostajemy w oknie */
	}
}

export function keepAwake() {
	let lock: WakeLockSentinel | null = null;
	const request = async () => {
		try {
			if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
		} catch {
			/* brak zgody / brak obsługi */
		}
	};
	const onVis = () => document.visibilityState === 'visible' && request();
	request();
	document.addEventListener('visibilitychange', onVis);
	return () => {
		document.removeEventListener('visibilitychange', onVis);
		lock?.release().catch(() => {});
	};
}

/** Pozostały czas w ms wg zegara serwera (offset liczony przy każdym stanie). */
export function remaining(deadline: number | null | undefined, offset: number) {
	if (!deadline) return 0;
	return Math.max(0, deadline - (Date.now() + offset));
}
