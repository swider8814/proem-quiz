// Wysyłka e-maili przez SendGrid (API v3). Bez konfiguracji maile nie wychodzą,
// a panel pokazuje link do skopiowania (zaproszenia). Klucz API tylko w .env.
//
//   SENDGRID_API_KEY=SG.xxxxx
//   MAIL_FROM=quiz@proem.pl          (adres zweryfikowany w SendGrid: Sender Identity / domena)
//   MAIL_FROM_NAME=Proem Quiz

import { isPanelLang, panelDict, type PanelLang } from '#lib/i18n/panel.js';

export type Mail = { to: string; subject: string; text: string; html: string };
type Sender = (mail: Mail) => Promise<void>;

const esc = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const mailConfigured = () => !!(process.env.SENDGRID_API_KEY && process.env.MAIL_FROM);

async function sendgrid(mail: Mail) {
	const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
		method: 'POST',
		headers: { authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			personalizations: [{ to: [{ email: mail.to }] }],
			from: { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || 'Proem Quiz' },
			subject: mail.subject,
			content: [
				{ type: 'text/plain', value: mail.text },
				{ type: 'text/html', value: mail.html }
			],
			// Linki jednorazowe nie mogą być przepisywane przez śledzenie kliknięć.
			tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } }
		}),
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) throw new Error(`SendGrid ${res.status}`);
}

// Testy nie podmieniają nadawcy – używają skrzynki w pliku (MAIL_TEST_OUTBOX=1, patrz sendMail).
const sender: Sender = sendgrid;
export const _testMode = () => process.env.MAIL_TEST_OUTBOX === '1';

/** Zwraca true, jeśli mail został wysłany. Błędy wysyłki są logowane, ale nie przerywają akcji. */
export async function sendMail(mail: Mail): Promise<boolean> {
	if (_testMode()) {
		// Testy: zamiast wysyłki dopisujemy do pliku w katalogu danych (tylko gdy MAIL_TEST_OUTBOX=1).
		const { appendFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		appendFileSync(join(process.env.DATA_DIR ?? 'data', 'outbox.jsonl'), JSON.stringify(mail) + '\n');
		return true;
	}
	if (!mailConfigured()) return false;
	try {
		await sender(mail);
		return true;
	} catch (e) {
		console.error('[mail] wysyłka nie powiodła się:', (e as Error).message);
		return false;
	}
}

type Lang = string | null | undefined; // język konta odbiorcy (pl / en / uk; brak → pl)
const langOf = (lang: Lang): PanelLang => (isPanelLang(lang) ? lang : 'pl');
const dictFor = (lang: Lang) => panelDict(langOf(lang));

function layout(lang: Lang, title: string, bodyHtml: string) {
	const t = dictFor(lang);
	return `<!doctype html><html lang="${langOf(lang)}"><body style="margin:0;background:#f6f6f8;font-family:Arial,sans-serif;color:#1d1d27">
<div style="max-width:520px;margin:24px auto;background:#fff;border:1px solid #e3e4ea;border-radius:12px;padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${bodyHtml}
<p style="font-size:12px;color:#666a7a;margin-top:28px">${esc(t.mail.footer)}</p>
</div></body></html>`;
}

const button = (lang: Lang, url: string, label: string) =>
	`<p><a href="${esc(url)}" style="display:inline-block;background:#1b1f3b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${esc(label)}</a></p>
<p style="font-size:12px;color:#666a7a;word-break:break-all">${esc(dictFor(lang).mail.fallback)} ${esc(url)}</p>`;

export function inviteMail(to: string, name: string, inviter: string, url: string, lang: Lang = 'pl'): Mail {
	const m = dictFor(lang).mail;
	return {
		to,
		subject: m.inviteSubject,
		text: `${m.hi(name)}\n\n${m.inviteText(inviter)}\n${url}\n`,
		html: layout(lang, m.inviteSubject, `<p>${esc(m.hi(name))}</p><p>${esc(m.inviteText(inviter))}</p>${button(lang, url, m.inviteButton)}`)
	};
}

export function resetMail(to: string, name: string, url: string, lang: Lang = 'pl'): Mail {
	const m = dictFor(lang).mail;
	return {
		to,
		subject: m.resetSubject,
		text: `${m.hi(name)}\n\n${m.resetText}\n${url}\n\n${m.resetIgnore}\n`,
		html: layout(lang, m.resetTitle, `<p>${esc(m.hi(name))}</p><p>${esc(m.resetText)}</p>${button(lang, url, m.resetButton)}<p>${esc(m.resetIgnore)}</p>`)
	};
}
