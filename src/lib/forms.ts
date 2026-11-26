// Wysyłanie formularzy POST w panelu – zawsze przez `use:enhance={send()}` (fetch), nie zwykłym POST.
//
// Dlaczego: po zwykłym POST bieżący wpis w historii to odpowiedź na POST. Odświeżenie strony –
// także automatyczne, gdy iOS Safari przeładowuje kartę po powrocie z innej aplikacji/karty –
// pokazuje „Czy chcesz ponownie wysłać formularz?”, a „Wyślij” powtarza akcję (drugie zaproszenie,
// druga gra, drugi quiz). Z `use:enhance` strona się nie przeładowuje, adres zostaje adresem GET,
// a akcje kończące się przekierowaniem 303 (Post/Redirect/Get) SvelteKit wykonuje jako zwykłą nawigację.
// Test `tests/forms-enhance.test.mjs` pilnuje, żeby żaden formularz POST nie został bez tego.
import type { ActionResult, SubmitFunction } from '$app/forms';

type SendOptions = {
	/** Pytanie przed wysłaniem (usuwanie, reset 2FA); „Anuluj” = nic się nie dzieje. */
	confirm?: () => string;
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

export function send(opts: SendOptions = {}): SubmitFunction {
	return ({ formElement, submitter, cancel }) => {
		if (pending.has(formElement) || (opts.confirm && !confirm(opts.confirm()))) {
			cancel();
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
