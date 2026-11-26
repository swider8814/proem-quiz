<script lang="ts">
	/**
	 * „Wstecz” na podstronach panelu: zawsze nad tytułem, z lewej, wygląda jak cichy przycisk
	 * (strzałka + napis, tło po najechaniu/dotknięciu, wysokość 44 px pod kciuk). W kodzie to
	 * zwykły link – nawigacja zostaje nawigacją (otwieranie w nowej karcie, czytniki ekranu).
	 */
	import Icon from '#lib/Icon.svelte';
	let { href, label }: { href: string; label: string } = $props();
</script>

<a class="back-link" {href}><Icon name="back" size="1.1em" weight={2} /><span>{label}</span></a>

<style>
	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		max-width: 100%;
		margin: 0 0 0.5rem -0.6rem;
		padding: 0 0.75rem 0 0.6rem;
		border-radius: var(--radius-s);
		color: #4b5064;
		font-weight: 600;
		text-decoration: none;
	}
	.back-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.back-link:hover,
	.back-link:active { background: var(--soft); color: var(--text); }
	.back-link:focus-visible { outline: none; box-shadow: var(--focus); }
</style>
