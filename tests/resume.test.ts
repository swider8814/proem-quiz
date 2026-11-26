// Powrót gracza po odświeżeniu strony: token kasowany tylko przy jednoznacznym `no-session`.
//   npx tsx tests/resume.test.ts
import { resumePlayer } from '../src/lib/game/client.ts';
// @ts-expect-error helper JS
const { ok, finish } = await import('./_helpers.mjs');

/** Serwer odpowiadający kolejno podanymi wynikami; liczy próby, przerwy i skasowanie tokenu. */
async function run(replies: { ok?: boolean; error?: string }[]) {
	let calls = 0;
	let forgotten = false;
	const waits: number[] = [];
	const res = await resumePlayer(
		async () => replies[Math.min(calls++, replies.length - 1)],
		() => (forgotten = true),
		{ sleep: async (ms) => void waits.push(ms) }
	);
	return { res, calls, forgotten, waits };
}

let r = await run([{ ok: true }]);
ok(r.res === 'ok' && r.calls === 1 && !r.forgotten, 'udany powrót za pierwszym razem');

r = await run([{ error: 'no-session' }]);
ok(r.res === 'gone' && r.forgotten && r.calls === 1, 'no-session → token skasowany, bez ponawiania');

r = await run([{ error: 'timeout' }, { error: 'rate-limited' }, { ok: true }]);
ok(r.res === 'ok' && !r.forgotten && r.calls === 3, 'timeout i limit przy zmianie Wi-Fi → token zostaje, trzecia próba udana');
ok(r.waits.length === 2 && r.waits[1] > r.waits[0], `rosnące przerwy między próbami (${r.waits.join(', ')} ms)`);

r = await run([{ error: 'timeout' }]);
ok(r.res === 'failed' && !r.forgotten && r.calls === 4, 'brak sieci przez wszystkie próby → token NIE jest kasowany');

r = await run([{ error: 'timeout' }, { error: 'no-session' }]);
ok(r.res === 'gone' && r.forgotten, 'timeout, potem no-session → token skasowany');

r = await run([{ error: 'already-joined' }]);
ok(r.res === 'failed' && !r.forgotten && r.calls === 1, 'already-joined → bez kasowania i bez ponawiania');

process.exit(finish() ? 1 : 0);
