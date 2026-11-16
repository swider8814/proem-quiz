// Wysyłka e-maili przez SendGrid (API v3). Bez konfiguracji maile nie wychodzą,
// a panel pokazuje link do skopiowania (zaproszenia). Klucz API tylko w .env.
//
//   SENDGRID_API_KEY=SG.xxxxx
//   MAIL_FROM=quiz@proem.pl          (adres zweryfikowany w SendGrid: Sender Identity / domena)
//   MAIL_FROM_NAME=Proem Quiz

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

// Dla testów: podmiana nadawcy (np. zapis do tablicy zamiast wysyłki).
let sender: Sender = sendgrid;
export const _setSender = (s: Sender | null) => (sender = s ?? sendgrid);
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

function layout(title: string, bodyHtml: string) {
	return `<!doctype html><html lang="pl"><body style="margin:0;background:#f6f6f8;font-family:Arial,sans-serif;color:#1d1d27">
<div style="max-width:520px;margin:24px auto;background:#fff;border:1px solid #e3e4ea;border-radius:12px;padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${bodyHtml}
<p style="font-size:12px;color:#666a7a;margin-top:28px">Proem Quiz · wiadomość wysłana automatycznie, nie odpowiadaj na nią.</p>
</div></body></html>`;
}

const button = (url: string, label: string) =>
	`<p><a href="${esc(url)}" style="display:inline-block;background:#1b1f3b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${esc(label)}</a></p>
<p style="font-size:12px;color:#666a7a;word-break:break-all">Jeśli przycisk nie działa, skopiuj adres: ${esc(url)}</p>`;

export function inviteMail(to: string, name: string, inviter: string, url: string): Mail {
	return {
		to,
		subject: 'Zaproszenie do Proem Quiz',
		text: `Cześć ${name}!\n\n${inviter} zaprasza Cię do Proem Quiz. Ustaw hasło, otwierając link (ważny 7 dni, działa raz):\n${url}\n`,
		html: layout('Zaproszenie do Proem Quiz', `<p>Cześć ${esc(name)}!</p><p>${esc(inviter)} zaprasza Cię do Proem Quiz. Ustaw hasło – link jest ważny 7 dni i działa raz.</p>${button(url, 'Ustaw hasło')}`)
	};
}

export function resetMail(to: string, name: string, url: string): Mail {
	return {
		to,
		subject: 'Reset hasła – Proem Quiz',
		text: `Cześć ${name}!\n\nKtoś (pewnie Ty) poprosił o reset hasła. Link jest ważny 1 godzinę i działa raz:\n${url}\n\nJeśli to nie Ty – zignoruj tę wiadomość, hasło się nie zmieni.\n`,
		html: layout('Reset hasła', `<p>Cześć ${esc(name)}!</p><p>Ktoś (pewnie Ty) poprosił o reset hasła do Proem Quiz. Link jest ważny 1 godzinę i działa raz.</p>${button(url, 'Ustaw nowe hasło')}<p>Jeśli to nie Ty – zignoruj tę wiadomość, hasło się nie zmieni. Weryfikacja dwuetapowa (jeśli ją masz) nadal będzie wymagana.</p>`)
	};
}
