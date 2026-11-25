<script lang="ts">
	/** Konfetti na podium: lekka animacja na canvasie, kilka sekund; wyłączona przy „ogranicz ruch”. */
	import { onMount } from 'svelte';
	let { delay = 0, duration = 6000 }: { delay?: number; duration?: number } = $props();
	let canvas: HTMLCanvasElement;

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const colors = ['#e4002b', '#1368ce', '#ffd23f', '#26890c', '#ff7ac6', '#ffffff'];
		let raf = 0;
		let start = 0;
		type P = { x: number; y: number; vx: number; vy: number; r: number; w: number; h: number; c: string; s: number };
		let parts: P[] = [];
		const resize = () => {
			canvas.width = canvas.clientWidth * devicePixelRatio;
			canvas.height = canvas.clientHeight * devicePixelRatio;
		};
		const burst = () => {
			const W = canvas.width;
			const H = canvas.height;
			const n = Math.min(260, Math.round(W / 6));
			parts = Array.from({ length: n }, (_, i) => {
				const left = i % 2 === 0;
				return {
					x: left ? 0 : W,
					y: H * 0.75,
					vx: (left ? 1 : -1) * (W / 120) * (0.5 + Math.random()),
					vy: -(H / 60) * (0.6 + Math.random() * 0.8),
					r: Math.random() * Math.PI,
					w: 6 + Math.random() * 8,
					h: 10 + Math.random() * 10,
					c: colors[i % colors.length],
					s: (Math.random() - 0.5) * 0.3
				};
			});
		};
		const frame = (t: number) => {
			if (!start) start = t;
			const W = canvas.width;
			const H = canvas.height;
			ctx.clearRect(0, 0, W, H);
			for (const p of parts) {
				p.vy += H / 4000;
				p.vx *= 0.99;
				p.x += p.vx;
				p.y += p.vy;
				p.r += p.s;
				ctx.save();
				ctx.translate(p.x, p.y);
				ctx.rotate(p.r);
				ctx.fillStyle = p.c;
				ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
				ctx.restore();
			}
			if (t - start < duration) raf = requestAnimationFrame(frame);
			else ctx.clearRect(0, 0, W, H);
		};
		const timer = setTimeout(() => {
			resize();
			burst();
			raf = requestAnimationFrame(frame);
		}, delay);
		addEventListener('resize', resize);
		return () => {
			clearTimeout(timer);
			cancelAnimationFrame(raf);
			removeEventListener('resize', resize);
		};
	});
</script>

<canvas bind:this={canvas} class="confetti" aria-hidden="true"></canvas>

<style>
	.confetti { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; }
</style>
