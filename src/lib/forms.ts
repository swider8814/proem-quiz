// Wysyłanie formularzy POST w panelu – zawsze przez `use:enhance={send()}` (fetch), nie zwykłym POST.
//
// Dlaczego: po zwykłym POST bieżący wpis w historii to odpowiedź na POST. Odświeżenie strony –
// także automatyczne, gdy iOS Safari przeładowuje kartę po powrocie z innej aplikacji/karty –
// pokazuje „Czy chcesz ponownie wysłać formularz?”, a „Wyślij” powtarza akcję (drugie zaproszenie,
// druga gra, drugi quiz). Z `use:enhance` strona się nie przeładowuje, adres zostaje adresem GET,
// a akcje kończące się przekierowaniem 303 (Post/Redirect/Get) SvelteKit wykonuje jako zwykłą nawigację.
// Test `tests/forms-enhance.test.mjs` pilnuje, żeby żaden formularz POST nie został bez tego.
import type { ActionResult, SubmitFunction } from '$app/forms';
import { ask, type AskOptions } from '#lib/dialog.svelte.js';

type SendOptions = {
	/** Pytanie przed wysłaniem (okno `ask()` w stylu aplikacji) – przy każdej akcji usuwającej, blokującej
	 * lub odbierającej dostęp; „Anuluj” = nic się nie dzieje. Tekst albo opcje okna (np. `confirmLabel`).
	 * Dostaje kliknięty przycisk: gdy formularz ma kilka przycisków, pusty wynik = wyślij bez pytania.
	 * Przycisk potwierdzenia jest domyślnie czerwony (`danger`). */
	confirm?: (submitter: HTMLElement | null) => string | AskOptions | null | undefined;
	/** Wyczyść pola po udanej akcji (formularze tworzące coś nowego). Domyślnie pola zostają. */
	reset?: boolean;
	/** Przeładuj dane strony po akcji. Wyłącz, gdy `load` po sukcesie przekierowałby gdzie indziej
	 * i zgubił jednorazowy wynik akcji (np. kody odzyskiwania po włączeniu 2FA). */
	invalidateAll?: boolean;
	/** Wywoływane po zastosowaniu wyniku (np. zamknięcie edycji w miejscu po sukcesie). */
	after?: (result: ActionResult) => void;
};

/** Formularze w trakcie wysyłania – drugie kliknięcie / Enter nie wyśle akcji drugi raz. */
const pending = new WeakSet<HTMLFormElement>();
/** Formularze z potwierdzonym pytaniem – następne wysłanie (requestSubmit po „Tak”) idzie bez pytania. */
const confirmed = new WeakSet<HTMLFormElement>();
/** Formularze, przy których okno z pytaniem jest właśnie otwarte. */
const asking = new WeakSet<HTMLFormElement>();

export function send(opts: SendOptions = {}): SubmitFunction {
	return ({ formElement, submitter, cancel }) => {
		if (pending.has(formElement) || asking.has(formElement)) {
			cancel();
			return;
		}
		const question = confirmed.has(formElement) ? null : opts.confirm?.(submitter);
		confirmed.delete(formElement);
		if (question) {
			// Okno jest asynchroniczne, a SubmitFunction – nie: wstrzymujemy wysłanie i po „Tak”
			// wysyłamy formularz jeszcze raz tym samym przyciskiem (ta sama wartość w FormData).
			cancel();
			asking.add(formElement);
			const o = typeof question === 'string' ? { message: question } : question;
			void ask({ danger: true, ...o }).then((yes) => {
				asking.delete(formElement);
				if (!yes || !formElement.isConnected) return;
				confirmed.add(formElement);
				const btn = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : null;
				formElement.requestSubmit(btn && btn.form === formElement ? btn : undefined);
			});
			return;
		}
		pending.add(formElement);
		formElement.setAttribute('aria-busy', 'true');
		// FormData jest już zebrane (z wartością klikniętego przycisku), więc można go zablokować.
		const button = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : null;
		if (button) button.disabled = true;

		return async ({ result, update }) => {
			try {
				await update({ reset: opts.reset ?? false, invalidateAll: opts.invalidateAll ?? true });
				opts.after?.(result);
			} finally {
				pending.delete(formElement);
				formElement.removeAttribute('aria-busy');
				if (button) button.disabled = false;
			}
		};
	};
}
