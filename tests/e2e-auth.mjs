// Uruchom: zbuduj, wystartuj serwer na 3123, utwórz admina (server/cli.js create-admin admin@proem.pl), potem:
//   node tests/e2e-auth.mjs /invite/<token>
// E2E test logowania: zaproszenie → hasło → wymuszone TOTP → kody zapasowe → wyloguj → login + TOTP → recovery → rate limit
import { generate } from 'otplib';
const BASE = process.env.BASE ?? 'http://localhost:3123';
const invite = process.argv[2];
let jar = {};
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function req(path, { method = 'GET', form } = {}) {
  const res = await fetch(BASE + path, {
    method, redirect: 'manual',
    headers: { accept: 'text/html', cookie: cookieHeader(), origin: BASE, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams(form) : undefined
  });
  for (const c of res.headers.getSetCookie()) {
    const [kv] = c.split(';'); const [k, ...v] = kv.split('=');
    if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(c)) delete jar[k]; else jar[k] = v.join('=');
  }
  return { status: res.status, loc: res.headers.get('location'), text: await res.text() };
}
const ok = (cond, msg) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) process.exitCode = 1; };

let r = await req('/panel'); ok(r.status === 303 && r.loc.startsWith('/login'), 'panel bez logowania → /login');
r = await req(invite); ok(r.status === 200 && r.text.includes('Ustaw hasło'), 'strona zaproszenia');
r = await req(invite, { method: 'POST', form: { password: 'short', repeat: 'short' } }); ok(r.status === 400, 'za krótkie hasło odrzucone');
r = await req(invite, { method: 'POST', form: { password: 'BardzoTajne123!', repeat: 'BardzoTajne123!' } });
ok(r.status === 303 && r.loc === '/panel', 'aktywacja → /panel');
r = await req('/panel'); ok(r.status === 303 && r.loc === '/panel/2fa-setup', 'admin bez TOTP → wymuszona konfiguracja');
r = await req('/panel/users'); ok(r.status === 303 && r.loc === '/panel/2fa-setup', 'admin bez TOTP nie wejdzie do użytkowników');
r = await req(invite); ok(r.status === 404, 'zaproszenie jednorazowe');
r = await req('/panel/2fa-setup'); ok(r.status === 200 && r.text.includes('data:image/png'), 'kod QR');
const secret = r.text.match(/<code class="copy[^>]*>([A-Z2-7 ]+)<\/code>/)?.[1]?.replace(/ /g, '');
ok(!!secret, 'sekret widoczny do ręcznego wpisania');
r = await req('/panel/2fa-setup', { method: 'POST', form: { code: '000000' } }); ok(r.status === 400, 'zły kod przy konfiguracji');
r = await req('/panel/2fa-setup', { method: 'POST', form: { code: await generate({ secret }) } });
const codes = [...r.text.matchAll(/<code>([A-Z0-9]{5}-[A-Z0-9]{5})<\/code>/g)].map(m => m[1]);
ok(r.status === 200 && codes.length === 10, `TOTP włączone, 10 kodów zapasowych`);
r = await req('/panel/users'); ok(r.status === 200 && r.text.includes('admin@proem.pl'), 'panel użytkowników dostępny');

// zaproszenie autora
r = await req('/panel/users?/invite', { method: 'POST', form: { name: 'Anna Autor', email: 'anna@proem.pl', role: 'author' } });
ok(r.status === 200 && r.text.includes('/invite/'), 'admin tworzy zaproszenie autora');
r = await req('/panel/users?/invite', { method: 'POST', form: { name: 'Anna', email: 'anna@proem.pl', role: 'author' } });
ok(r.status === 400, 'duplikat e-maila odrzucony');

await req('/logout', { method: 'POST', form: {} });
r = await req('/panel'); ok(r.status === 303, 'po wylogowaniu brak dostępu');

r = await req('/login', { method: 'POST', form: { email: 'admin@proem.pl', password: 'zle-haslo-123' } }); ok(r.status === 400, 'złe hasło');
r = await req('/login', { method: 'POST', form: { email: 'ADMIN@proem.pl', password: 'BardzoTajne123!' } });
ok(r.status === 303 && r.loc === '/login/2fa', 'hasło OK → wymagany kod');
r = await req('/panel'); ok(r.status === 303 && r.loc === '/login/2fa', 'bez kodu brak panelu');
r = await req('/login/2fa', { method: 'POST', form: { mode: 'totp', code: await generate({ secret }) } });
ok(r.status === 400, 'ten sam kod TOTP drugi raz odrzucony (replay)');
r = await req('/login/2fa', { method: 'POST', form: { mode: 'recovery', code: codes[0].toLowerCase() } });
ok(r.status === 303 && r.loc.startsWith('/panel/security'), 'logowanie kodem zapasowym');
r = await req('/panel/security'); ok(r.text.includes('<strong>9</strong>'), 'zostało 9 kodów');

await req('/logout', { method: 'POST', form: {} });
await req('/login', { method: 'POST', form: { email: 'admin@proem.pl', password: 'BardzoTajne123!' } });
r = await req('/login/2fa', { method: 'POST', form: { mode: 'recovery', code: codes[0] } }); ok(r.status === 400, 'zużyty kod zapasowy odrzucony');
let got429 = false;
for (let i = 0; i < 8 && !got429; i++) { r = await req('/login/2fa', { method: 'POST', form: { mode: 'totp', code: '123456' } }); got429 = r.status === 429; }
ok(got429, 'limit prób kodu → 429 i wylogowanie');
r = await req('/panel'); ok(r.status === 303 && r.loc.startsWith('/login?'), 'sesja usunięta po limicie');

// CSRF: POST bez poprawnego Origin
const csrf = await fetch(BASE + '/login', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
ok(csrf.status === 403, 'CSRF z obcej domeny zablokowany');

for (let i = 0; i < 5; i++) await req('/login', { method: 'POST', form: { email: 'anna@proem.pl', password: 'x'.repeat(12) } });
r = await req('/login', { method: 'POST', form: { email: 'anna@proem.pl', password: 'x'.repeat(12) } });
ok(r.status === 429, 'limit prób logowania na konto');
