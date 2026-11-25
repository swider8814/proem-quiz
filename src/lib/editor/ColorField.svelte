<script lang="ts">
	// Kolor: próbnik przeglądarki + pole HEX do wpisania/wklejenia (np. #ffd23f z księgi znaku).
	// Okienko próbnika to element systemu – jego tryb (RGB/HEX) wybiera przeglądarka, nie strona.
	let { value = $bindable(), label }: { value: string; label: string } = $props();
	let text = $state('');
	$effect(() => {
		text = value; // zmiana z próbnika albo z gotowego zestawu kolorów
	});
	const norm = (s: string) => {
		let h = s.trim().replace(/^#?/, '#').toLowerCase();
		if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
		return /^#[0-9a-f]{6}$/.test(h) ? h : null;
	};
	const ok = $derived(norm(text) !== null);
</script>

<div class="color">
	<input type="color" bind:value aria-label={label} />
	<span class="name">{label}</span>
	<input
		class="hex"
		class:bad={!ok}
		type="text"
		inputmode="text"
		spellcheck="false"
		autocomplete="off"
		maxlength="7"
		aria-label="{label} (HEX)"
		aria-invalid={!ok}
		bind:value={text}
		oninput={() => {
			// Na żywo tylko pełny zapis #rrggbb – skrót #rgb dopiero po wyjściu z pola (nie przerywa pisania).
			const h = norm(text);
			if (h && /^#?[0-9a-f]{6}$/i.test(text.trim())) value = h;
		}}
		onblur={() => {
			const h = norm(text);
			if (h) value = h;
			text = value;
		}}
	/>
</div>

<style>
	.color { display: flex; align-items: center; gap: 0.6rem; margin: 0.5rem 0 0; }
	.color input[type='color'] { width: 2.6rem; height: 2rem; padding: 0; border: 1px solid #c9cbd3; border-radius: 0.3rem; background: none; flex: none; cursor: pointer; }
	.name { flex: 1; min-width: 0; }
	.hex { width: 6.2rem; flex: none; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9rem; padding: 0.35rem 0.5rem; text-transform: lowercase; }
	.hex.bad { border-color: var(--danger, #c0392b); outline-color: var(--danger, #c0392b); }
</style>
