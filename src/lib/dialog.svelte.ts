// Okna z pytaniem w stylu aplikacji – zamiast natywnych confirm()/alert() przeglądarki.
//
// Dlaczego nie confirm(): wygląda inaczej w każdej przeglądarce, nie da się w nim dać więcej niż dwóch
// przycisków ani nazwać ich czynnością („Usuń” zamiast „OK”), a w Safari na macOS w trybie pełnoekranowym
// potrafi wyrzucić z pełnego ekranu albo schować się za czarnym ekranem.
//
// Jedno okno na całą aplikację (`ConfirmDialog.svelte` w głównym layoucie). Użycie:
//   if (await ask({ message: 'Usunąć quiz?', confirmLabel: 'Usuń', danger: true })) …
//   const c = await choose({ title, message, actions: [{ id: 'save', label: 'Zapisz', kind: 'primary' }, …] });

export type DialogAction = { id: string; label: string; kind?: 'primary' | 'danger' | 'secondary'; icon?: 'save' | 'trash' };
export type DialogRequest = { title?: string; message: string; actions: DialogAction[] };
type Pending = DialogRequest & { resolve: (id: string | null) => void };

let current = $state<Pending | null>(null);

export const dialogState = {
	get current() {
		return current;
	}
};

/** Okno z dowolnymi przyciskami. Zwraca id klikniętego przycisku albo null (Esc, „Anuluj”, kliknięcie obok). */
export function choose(req: DialogRequest): Promise<string | null> {
	// Nowe pytanie, gdy poprzednie jeszcze wisi (np. drugi skrót klawiszowy) – poprzednie = anulowane.
	current?.resolve(null);
	return new Promise((resolve) => {
		current = { ...req, resolve };
	});
}

/** Odpowiedź z okna (wywołuje komponent okna). */
export function answer(id: string | null) {
	const c = current;
	current = null;
	c?.resolve(id);
}

export type AskOptions = {
	message: string;
	title?: string;
	/** Tekst przycisku potwierdzenia – najlepiej czynność („Usuń”, „Zablokuj”); domyślnie „Potwierdź”. */
	confirmLabel?: string;
	cancelLabel?: string;
	/** Czerwony przycisk potwierdzenia (usuwanie, blokowanie, odbieranie dostępu). */
	danger?: boolean;
	icon?: DialogAction['icon'];
};

/** Domyślne teksty przycisków – ustawia komponent okna według języka panelu. */
export const askDefaults = { confirm: 'Potwierdź', cancel: 'Anuluj' };

/** Pytanie tak/nie. true = potwierdzone. */
export async function ask(o: AskOptions | string): Promise<boolean> {
	const opts = typeof o === 'string' ? { message: o } : o;
	const id = await choose({
		title: opts.title,
		message: opts.message,
		actions: [
			{ id: 'ok', label: opts.confirmLabel ?? askDefaults.confirm, kind: opts.danger ? 'danger' : 'primary', icon: opts.icon },
			{ id: 'cancel', label: opts.cancelLabel ?? askDefaults.cancel, kind: 'secondary' }
		]
	});
	return id === 'ok';
}
