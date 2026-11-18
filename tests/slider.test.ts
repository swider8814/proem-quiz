// Środek suwaka (telefon wysyła go, gdy gracz nie ruszy suwaka) musi leżeć na siatce kroku,
// którą sprawdza serwer (server/game/engine.js).   npx tsx tests/slider.test.ts
import { sliderMid } from '../src/lib/game/slider.ts';

let failed = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) failed++; };
// Ta sama reguła co na serwerze.
const onGrid = (v: number, d: { min: number; max: number; step: number }) => {
	const steps = (v - d.min) / d.step;
	return v >= d.min - d.step / 1000 && v <= d.max + d.step / 1000 && Math.abs(steps - Math.round(steps)) <= 1e-6;
};
const cases = [
	{ min: 0, max: 100, step: 1, want: 50 },
	{ min: 0.05, max: 0.25, step: 0.1, want: 0.15 },
	{ min: 0.1, max: 0.5, step: 0.1, want: 0.3 },
	{ min: 1.25, max: 3, step: 0.5, want: 2.25 },
	{ min: -7, max: 10, step: 3 },
	{ min: 1900, max: 2026, step: 1 },
	{ min: 0.001, max: 1, step: 0.01 }
];
for (const c of cases) {
	const m = sliderMid(c);
	ok(onGrid(m, c) && (c.want === undefined || m === c.want), `środek ${JSON.stringify(c)} → ${m}`);
}
if (failed) { console.log(`\n${failed} błędów`); process.exit(1); }
console.log('\nWszystko OK');
