<script lang="ts" module>
	/** Liczba awatarów (zwierzaki narysowane od zera z prostych kształtów). */
	export const AVATAR_COUNT = 12;
</script>

<script lang="ts">
	/**
	 * Awatar gracza: proste, własne zwierzaki z kół i trójkątów (bez cudzych postaci).
	 * animated – delikatne kołysanie i mruganie (wyłączane przy „ogranicz ruch”).
	 */
	let { id, size = '2.4em', animated = false, label = '' }: { id: number; size?: string; animated?: boolean; label?: string } = $props();

	type Ears = 'round' | 'pointy' | 'long' | 'none' | 'tuft';
	type Kind = { face: string; ear: string; ears: Ears; snout?: string; beak?: string; mane?: string; cheeks?: boolean; whiskers?: boolean };
	const KINDS: Kind[] = [
		{ face: '#f4a259', ear: '#e07a2f', ears: 'pointy', whiskers: true, cheeks: true }, // kot
		{ face: '#c9a27e', ear: '#8c6748', ears: 'round', snout: '#efe1d1' }, // pies
		{ face: '#9b6a46', ear: '#7a5236', ears: 'round', snout: '#d9b99b' }, // miś
		{ face: '#f1f1f1', ear: '#f7c6d0', ears: 'long', cheeks: true }, // królik
		{ face: '#ff8c42', ear: '#d95f1a', ears: 'pointy', snout: '#fff3e6' }, // lis
		{ face: '#a77c52', ear: '#7d5a38', ears: 'tuft', beak: '#f2b134' }, // sowa
		{ face: '#3d3d4e', ear: '#3d3d4e', ears: 'none', beak: '#f2a03d', snout: '#ffffff' }, // pingwin
		{ face: '#6cc070', ear: '#4e9a52', ears: 'none', cheeks: true }, // żaba
		{ face: '#f7b2bd', ear: '#ef8fa0', ears: 'pointy', snout: '#ef8fa0' }, // świnka
		{ face: '#f2c14e', ear: '#d99a2b', ears: 'round', mane: '#c97b2a', snout: '#fbe3a5' }, // lew
		{ face: '#b8bcc6', ear: '#f2b8c6', ears: 'round', whiskers: true }, // myszka
		{ face: '#ffd84d', ear: '#ffd84d', ears: 'tuft', beak: '#ff9f1c', cheeks: true } // kurczak
	];
	const k = $derived(KINDS[((id % KINDS.length) + KINDS.length) % KINDS.length]);
	const isFrog = $derived(id % KINDS.length === 7);
</script>

<svg class="avatar" class:animated width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}>
	<g class="body">
		{#if k.mane}<circle cx="50" cy="54" r="44" fill={k.mane} />{/if}
		{#if k.ears === 'round'}
			<circle cx="22" cy="24" r="14" fill={k.ear} /><circle cx="78" cy="24" r="14" fill={k.ear} />
		{:else if k.ears === 'pointy'}
			<path d="M14 40 L22 6 L42 26 Z" fill={k.ear} /><path d="M86 40 L78 6 L58 26 Z" fill={k.ear} />
		{:else if k.ears === 'long'}
			<ellipse cx="35" cy="16" rx="9" ry="22" fill={k.face} /><ellipse cx="65" cy="16" rx="9" ry="22" fill={k.face} />
			<ellipse cx="35" cy="17" rx="4.5" ry="15" fill={k.ear} /><ellipse cx="65" cy="17" rx="4.5" ry="15" fill={k.ear} />
		{:else if k.ears === 'tuft'}
			<path d="M28 22 L34 6 L44 20 Z" fill={k.ear} /><path d="M72 22 L66 6 L56 20 Z" fill={k.ear} />
		{/if}
		<circle cx="50" cy="56" r="36" fill={k.face} />
		{#if k.snout && !k.beak}<ellipse cx="50" cy="70" rx="16" ry="12" fill={k.snout} />{/if}
		{#if k.beak && k.snout}<ellipse cx="50" cy="62" rx="24" ry="22" fill={k.snout} />{/if}
		{#if isFrog}
			<circle cx="34" cy="28" r="12" fill={k.face} /><circle cx="66" cy="28" r="12" fill={k.face} />
		{/if}
		<g class="eyes">
			<circle cx="37" cy={isFrog ? 28 : 50} r="6" fill="#1b1b24" /><circle cx="63" cy={isFrog ? 28 : 50} r="6" fill="#1b1b24" />
			<circle cx="39" cy={isFrog ? 26 : 48} r="2" fill="#fff" /><circle cx="65" cy={isFrog ? 26 : 48} r="2" fill="#fff" />
		</g>
		{#if k.beak}
			<path d="M42 62 L58 62 L50 72 Z" fill={k.beak} />
		{:else}
			<ellipse cx="50" cy="64" rx="5" ry="3.5" fill="#3a2a24" />
			<path d="M43 71 Q50 77 57 71" stroke="#3a2a24" stroke-width="2.5" fill="none" stroke-linecap="round" />
		{/if}
		{#if k.cheeks}<circle cx="28" cy="66" r="5" fill="#ff7a9a" opacity="0.5" /><circle cx="72" cy="66" r="5" fill="#ff7a9a" opacity="0.5" />{/if}
		{#if k.whiskers}
			<path d="M20 62 H36 M20 68 H36 M64 62 H80 M64 68 H80" stroke="#3a2a24" stroke-width="1.6" stroke-linecap="round" opacity="0.7" />
		{/if}
	</g>
</svg>

<style>
	.avatar { display: block; flex-shrink: 0; overflow: visible; }
	.animated .body { animation: bob 2.4s ease-in-out infinite; transform-origin: 50% 90%; }
	.animated .eyes { animation: blink 4.5s infinite; transform-origin: 50% 50%; transform-box: fill-box; }
	@keyframes bob { 0%, 100% { transform: rotate(-4deg) translateY(0); } 50% { transform: rotate(4deg) translateY(-3px); } }
	@keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
	@media (prefers-reduced-motion: reduce) { .animated .body, .animated .eyes { animation: none; } }
</style>
