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
