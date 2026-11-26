/*
 * Animacje panelu przez Web Animations API (element.animate). Czysty CSS do rozwijania <details>
 * (::details-content + interpolate-size) i wysuwania menu (@starting-style) nie działał w Safari
 * na iOS, a element.animate działa we wszystkich obsługiwanych przeglądarkach.
 * Przy „ogranicz ruch” w systemie nic się nie animuje.
 */

export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const DUR = 220;

export function reduceMotion(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Menu na telefonie: wysunięcie spod paska przy otwarciu. */
export function slideIn(el: HTMLElement): void {
	if (reduceMotion() || !el.animate) return;
	el.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: DUR, easing: EASE_OUT });
}

/**
 * Akcja dla <details>: płynne rozwijanie i zwijanie (wysokość). Kliknięcie w trakcie ruchu
 * odwraca kierunek. Otwieranie z kodu (np. wyszukiwanie w Pomocy) działa bez animacji, jak dotąd.
 */
export function smoothDetails(el: HTMLDetailsElement) {
	const summary = el.querySelector('summary');
	if (!summary) return;
	let anim: Animation | null = null;
	let closing = false;

	const animate = (from: number, to: number, done: () => void) => {
		anim?.cancel();
		el.style.overflow = 'hidden';
		const a = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: DUR, easing: EASE_OUT });
		anim = a;
		// Zdarzenia finish/cancel przychodzą asynchronicznie – reagujemy tylko, gdy to wciąż bieżąca
		// animacja. Inaczej spóźnione „cancel” poprzedniej wyzerowałoby nową (szybkie potrójne dotknięcie).
		a.onfinish = () => {
			if (anim !== a) return;
			anim = null;
			el.style.overflow = '';
			done();
		};
		a.oncancel = () => {
			if (anim !== a) return;
			anim = null;
			el.style.overflow = '';
		};
	};

	const onClick = (e: MouseEvent) => {
		if (reduceMotion() || !el.animate) return;
		e.preventDefault();
		const start = el.getBoundingClientRect().height;
		if (!el.open || closing) {
			// Otwieranie (także odwrócenie zwijania)
			closing = false;
			el.open = true;
			anim?.cancel();
			const end = el.getBoundingClientRect().height;
			animate(start, end, () => {});
		} else {
			closing = true;
			const borders = el.offsetHeight - el.clientHeight;
			const end = summary.getBoundingClientRect().height + borders;
			animate(start, end, () => {
				closing = false;
				el.open = false;
			});
		}
	};

	summary.addEventListener('click', onClick);
	return {
		destroy() {
			summary.removeEventListener('click', onClick);
			anim?.cancel();
		}
	};
}
