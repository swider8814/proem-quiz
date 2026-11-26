// Panel po angielsku: język konta, przełącznik, e-maile, komunikaty błędów i brak polskich tekstów.
//   node tests/i18n.test.mjs   (wymaga npm run build)
import fs from 'node:fs';
import path from 'node:path';
import { Browser, finish, makeAdmin, ok, startServer } from './_helpers.mjs';

const srv = await startServer({ MAIL_TEST_OUTBOX: '1' });
const B = () => new Browser(srv.base);
const outbox = () => {
	const f = path.join(srv.dataDir, 'outbox.jsonl');
	return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
};
const json = { 'content-type': 'application/json', accept: 'application/json' };

// Polskie litery w widocznym tekście strony (bez skryptów, stylów i treści wpisanej przez użytkowników).
const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
function visibleText(html) {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<option value="pl"[^>]*>Polski<\/option>/g, '')
		.replace(/<button[^>]*lang="pl"[^>]*>Polski<\/button>/g, '')
		.replace(/<[^>]+>/g, ' ');
}
function polishLeft(html, allowed = []) {
	let text = visibleText(html);
	for (const a of allowed) text = text.split(a).join('');
	const words = text.split(/\s+/).filter((w) => POLISH.test(w));
	return [...new Set(words)];
}

try {
	const adm = await makeAdmin(srv, 'admin@proem.pl');
	const admin = adm.browser;

	// ── Zaproszenie lektora po angielsku ──
	const inv = await admin.req('/panel/users?/invite', { method: 'POST', form: { name: 'John Smith', email: 'john@proem.pl', role: 'author', locale: 'en' } });
	ok(inv.status === 200, 'zaproszenie konta z językiem EN');
	const mail = outbox().find((m) => m.to === 'john@proem.pl');
	ok(mail && /Invitation to Proem Quiz/.test(mail.subject) && /Set password/.test(mail.html) && !POLISH.test(mail.text), 'e-mail z zaproszeniem po angielsku');
	ok(/<html lang="en">/.test(mail?.html ?? ''), 'e-mail ma lang="en"');
	const link = inv.text.match(/\/invite\/[A-Za-z0-9_-]+/)[0];

	const john = B();
	const invPage = await john.req(link);
	ok(/<html lang="en">/.test(invPage.text) && /Welcome, John Smith!/.test(invPage.text), 'strona aktywacji w języku konta (EN)');
	const short = await john.req(link, { method: 'POST', form: { password: 'krotkie', repeat: 'krotkie' } });
	ok(short.status === 400 && /at least 10 characters/.test(short.text), 'błąd hasła po angielsku');
	await john.req(link, { method: 'POST', form: { password: 'LecturerPass123!', repeat: 'LecturerPass123!' } });

	// ── Panel autora po angielsku ──
	const list = await john.req('/panel');
	ok(list.status === 200 && /<html lang="en">/.test(list.text) && /Create quiz/.test(list.text), 'lista quizów po angielsku');
	ok(polishLeft(list.text).length === 0, `lista bez polskich tekstów: ${polishLeft(list.text).join(' ')}`);

	const c = await john.req('/panel?/create', { method: 'POST', form: { title: 'Christmas quiz' } });
	const quizId = c.loc.split('/').pop();
	const editor = await john.req(`/panel/quizzes/${quizId}`);
	ok(/Add question/.test(editor.text), 'edytor po angielsku');
	ok(polishLeft(editor.text, ['Українська']).length === 0, `edytor bez polskich tekstów: ${polishLeft(editor.text).join(' ')}`);
	ok(/"locale":"en"/.test(editor.text) || /locale:"en"/.test(editor.text), 'nowy quiz lektora ma domyślnie język gry EN');

	const bad = {
		title: 'Christmas quiz', description: null, themeId: null, locale: 'en',
		settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
		questions: [{ type: 'choice', prompt: '', promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1, data: { type: 'choice', answers: ['A', 'B'], correct: [0] } }]
	};
	const save = await john.req(`/panel/api/quizzes/${quizId}`, { method: 'PUT', body: JSON.stringify(bad), headers: json });
	ok(save.status === 400 && JSON.parse(save.text).error === 'Question 1: Enter the question text', `błąd walidacji po angielsku: ${save.text}`);
	const bad2 = { ...bad, questions: [{ ...bad.questions[0], prompt: 'x'.repeat(500) }] };
	const save2 = await john.req(`/panel/api/quizzes/${quizId}`, { method: 'PUT', body: JSON.stringify(bad2), headers: json });
	ok(save2.status === 400 && JSON.parse(save2.text).error === 'Question 1: Invalid data.', 'wbudowany błąd schematu → ogólny komunikat');

	for (const page of [`/panel/quizzes/${quizId}/host`, `/panel/quizzes/${quizId}/share`, '/panel/security']) {
		const r = await john.req(page);
		ok(r.status === 200 && polishLeft(r.text).length === 0, `${page} bez polskich tekstów: ${polishLeft(r.text).join(' ')}`);
	}
	const media = await john.req('/panel/api/media', { method: 'POST', body: (() => { const fd = new FormData(); fd.append('file', new Blob([Buffer.from('to nie jest plik')]), 'x.txt'); return fd; })(), headers: { accept: 'application/json' } });
	ok(media.status === 400 && /Unsupported file format/.test(media.text), 'błąd pliku po angielsku');

	// ── Przełącznik języka ──
	const sw = await john.req('/lang', { method: 'POST', form: { lang: 'pl', next: `/panel/quizzes/${quizId}` } });
	ok(sw.status === 303 && sw.loc === `/panel/quizzes/${quizId}`, 'przełącznik wraca na tę samą stronę');
	ok(/Dodaj pytanie/.test((await john.req(`/panel/quizzes/${quizId}`)).text), 'po przełączeniu panel po polsku (zapis w koncie)');
	await john.req('/lang', { method: 'POST', form: { lang: 'en', next: '/panel' } });

	for (const evil of ['https://evil.example/x', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)']) {
		const r = await john.req('/lang', { method: 'POST', form: { lang: 'en', next: evil } });
		ok(r.status === 303 && r.loc.startsWith('/') && !r.loc.startsWith('//') && !r.loc.includes('evil.example'), `brak otwartego przekierowania (${evil} → ${r.loc})`);
	}
	const csrf = await john.req('/lang', { method: 'POST', form: { lang: 'pl', next: '/panel' }, headers: { origin: 'https://evil.example' } });
	ok(csrf.status === 403, 'zmiana języka z obcej strony zablokowana (CSRF)');
	const bogus = await john.req('/lang', { method: 'POST', form: { lang: 'de', next: '/panel' } });
	ok(bogus.status === 303 && /Create quiz/.test((await john.req('/panel')).text), 'nieznany język ignorowany');

	// ── Niezalogowani: język z przeglądarki i z ciasteczka ──
	const anon = await B().req('/login', { headers: { 'accept-language': 'en-GB,en;q=0.9' } });
	ok(/<html lang="en">/.test(anon.text) && /Forgot your password\?/.test(anon.text), 'logowanie po angielsku dla przeglądarki EN');
	const anonPl = await B().req('/login', { headers: { 'accept-language': 'pl-PL,pl;q=0.9,en;q=0.8' } });
	ok(/<html lang="pl">/.test(anonPl.text) && /Nie pamiętasz hasła/.test(anonPl.text), 'logowanie po polsku dla przeglądarki PL');
	const v = B();
	await v.req('/lang', { method: 'POST', form: { lang: 'en', next: '/login' } });
	ok(/Sign in/.test((await v.req('/login', { headers: { 'accept-language': 'pl' } })).text), 'ciasteczko języka ma pierwszeństwo przed przeglądarką');
	const wrong = await v.req('/login', { method: 'POST', form: { email: 'john@proem.pl', password: 'zle-haslo-123' } });
	ok(/Incorrect email or password/.test(wrong.text), 'błąd logowania po angielsku');

	// ── Reset hasła: e-mail i strona w języku konta ──
	await B().req('/login/forgot', { method: 'POST', form: { email: 'john@proem.pl' } });
	let reset;
	for (let i = 0; i < 40 && !reset; i++) {
		reset = outbox().find((m) => m.to === 'john@proem.pl' && /reset/i.test(m.subject));
		if (!reset) await new Promise((r) => setTimeout(r, 50));
	}
	ok(reset && /Password reset – Proem Quiz/.test(reset.subject) && !POLISH.test(reset.text), 'e-mail resetu po angielsku');
	const resetLink = reset?.text.match(/\/reset\/[A-Za-z0-9_-]+/)?.[0];
	const rp = await B().req(resetLink, { headers: { 'accept-language': 'pl' } });
	ok(/Set a new password/.test(rp.text) && /<html lang="en">/.test(rp.text), 'strona resetu w języku konta, nie przeglądarki');

	// ── Administrator po angielsku: wszystkie strony admina ──
	await admin.req('/lang', { method: 'POST', form: { lang: 'en', next: '/panel' } });
	const allowed = ['Proem Zako – obozy', 'Święta Bożego Narodzenia']; // nazwy motywów (dane, nie teksty interfejsu)
	for (const page of ['/panel', '/panel/users', '/panel/themes', '/panel/themes/theme_proem', '/panel/settings', '/panel/security']) {
		const r = await admin.req(page);
		const left = polishLeft(r.text, allowed);
		ok(r.status === 200 && left.length === 0, `admin ${page} bez polskich tekstów: ${left.join(' ')}`);
	}
	const usersPage = await admin.req('/panel/users');
	const johnId = usersPage.text.match(/name="id" value="(usr_[A-Za-z0-9_-]+)"[^]*?john@proem\.pl/)?.[1]
		?? [...usersPage.text.matchAll(/<tr[^]*?<\/tr>/g)].map((m) => m[0]).find((r) => r.includes('john@proem.pl'))?.match(/value="(usr_[A-Za-z0-9_-]+)"/)?.[1];
	ok(!!johnId, 'ID konta lektora w tabeli');
	const loc = await admin.req('/panel/users?/locale', { method: 'POST', form: { id: johnId, locale: 'pl' } });
	ok(loc.status === 200 && /Dodaj pytanie/.test((await john.req(`/panel/quizzes/${quizId}`)).text), 'admin zmienia język konta');
	const locBad = await admin.req('/panel/users?/locale', { method: 'POST', form: { id: johnId, locale: 'xx' } });
	ok(locBad.status === 400, 'nieznany język konta odrzucony');
	const asAuthor = await john.req('/panel/users?/locale', { method: 'POST', form: { id: johnId, locale: 'en' } });
	ok(asAuthor.status === 403, 'autor nie zmienia języka przez panel administratora');

	// Przełącznik działa też w trakcie obowiązkowej konfiguracji 2FA (sesja pośrednia) – review Codexa #4
	{
		const { browser: newAdmin } = await makeAdmin(srv, 'nowy-admin@proem.pl', { totp: false });
		const before = await newAdmin.req('/panel/2fa-setup');
		ok(/Weryfikacja dwuetapowa/.test(before.text), 'konfiguracja 2FA najpierw po polsku');
		await newAdmin.req('/lang', { method: 'POST', form: { lang: 'en', next: '/panel/2fa-setup' } });
		const after = await newAdmin.req('/panel/2fa-setup');
		ok(/Two-step verification/.test(after.text) && /<html lang="en">/.test(after.text), 'po przełączeniu konfiguracja 2FA po angielsku');
		const { generate } = await import('otplib');
		const secret = after.text.match(/<code class="copy[^>]*>([A-Z2-7 ]+)<\/code>/)[1].replace(/ /g, '');
		await newAdmin.req('/panel/2fa-setup', { method: 'POST', form: { code: await generate({ secret }) } });
		ok(/Create quiz/.test((await newAdmin.req('/panel')).text), 'język wybrany podczas konfiguracji 2FA zapisany w koncie');
	}

	// ── Ukraiński: przeglądarka, konto, e-mail, panel ──
	{
		const anonUk = await B().req('/login', { headers: { 'accept-language': 'uk-UA,uk;q=0.9,en;q=0.8' } });
		ok(/<html lang="uk">/.test(anonUk.text) && /Забули пароль\?/.test(anonUk.text), 'logowanie po ukraińsku dla przeglądarki UK');
		const anonRu = await B().req('/login', { headers: { 'accept-language': 'ru-RU,ru;q=0.9' } });
		ok(/<html lang="en">/.test(anonRu.text), 'inna przeglądarka (RU) → angielski');
		const invUk = await admin.req('/panel/users?/invite', { method: 'POST', form: { name: 'Олена Коваль', email: 'olena@proem.pl', role: 'author', locale: 'uk' } });
		ok(invUk.status === 200, 'zaproszenie konta z językiem UK');
		const mailUk = outbox().find((m) => m.to === 'olena@proem.pl');
		ok(mailUk && /Запрошення до Proem Quiz/.test(mailUk.subject) && /<html lang="uk">/.test(mailUk.html) && !POLISH.test(mailUk.text), 'e-mail z zaproszeniem po ukraińsku');
		const linkUk = invUk.text.match(/\/invite\/[A-Za-z0-9_-]+/)[0];
		const olena = B();
		const invUkPage = await olena.req(linkUk);
		ok(/<html lang="uk">/.test(invUkPage.text) && /Вітаємо, Олена Коваль!/.test(invUkPage.text), 'strona aktywacji po ukraińsku');
		await olena.req(linkUk, { method: 'POST', form: { password: 'UkrainianPass123!', repeat: 'UkrainianPass123!' } });
		const listUk = await olena.req('/panel');
		ok(/<html lang="uk">/.test(listUk.text) && /Створити вікторину/.test(listUk.text), 'lista quizów po ukraińsku');
		ok(polishLeft(listUk.text).length === 0, `lista UK bez polskich tekstów: ${polishLeft(listUk.text).join(' ')}`);
		const cUk = await olena.req('/panel?/create', { method: 'POST', form: { title: 'Різдвяна вікторина' } });
		const ukQuiz = cUk.loc.split('/').pop();
		for (const page of [`/panel/quizzes/${ukQuiz}`, `/panel/quizzes/${ukQuiz}/host`, `/panel/quizzes/${ukQuiz}/share`, '/panel/security']) {
			const r = await olena.req(page);
			ok(r.status === 200 && /<html lang="uk">/.test(r.text) && polishLeft(r.text).length === 0, `UK ${page} bez polskich tekstów: ${polishLeft(r.text).join(' ')}`);
		}
		const anonUkCookie = B();
		await anonUkCookie.req('/lang', { method: 'POST', form: { lang: 'uk', next: '/login' } });
		const badUk = await anonUkCookie.req('/login', { method: 'POST', form: { email: 'olena@proem.pl', password: 'zle-haslo-123' } });
		ok(/Неправильна адреса ел\. пошти або пароль/.test(badUk.text), 'błąd logowania po ukraińsku');
		await admin.req('/lang', { method: 'POST', form: { lang: 'uk', next: '/panel' } });
		for (const page of ['/panel', '/panel/users', '/panel/themes', '/panel/settings']) {
			const r = await admin.req(page);
			const left = polishLeft(r.text, allowed);
			ok(r.status === 200 && left.length === 0, `admin UK ${page} bez polskich tekstów: ${left.join(' ')}`);
		}
		ok(/Користувачі/.test((await admin.req('/panel/users')).text), 'panel administratora po ukraińsku');
	}

	ok(srv.alive(), 'serwer działa do końca testu');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	srv.stop();
}
process.exit(finish() ? 1 : 0);
