// #13: X-Forwarded-For tylko od zaufanych proxy.   node tests/net.test.mjs
import { resolveClientIp } from '../server/net.js';
import { finish, ok } from './_helpers.mjs';

delete process.env.TRUSTED_PROXIES;
ok(resolveClientIp('203.0.113.9', '1.2.3.4') === '203.0.113.9', 'bez TRUSTED_PROXIES nagłówek jest ignorowany');
process.env.TRUSTED_PROXIES = '10.0.0.0/8, 2001:db8::/32';
ok(resolveClientIp('203.0.113.9', '1.2.3.4') === '203.0.113.9', 'połączenie bezpośrednie (spoza proxy) nie może podrobić IP');
ok(resolveClientIp('10.1.2.3', '198.51.100.7') === '198.51.100.7', 'przez zaufane proxy – adres klienta z nagłówka');
ok(resolveClientIp('::ffff:10.1.2.3', '198.51.100.7') === '198.51.100.7', 'adres IPv4 zapisany jako IPv6');
ok(resolveClientIp('10.1.2.3', '6.6.6.6, 198.51.100.7') === '198.51.100.7', 'podrobiony wpis klienta po lewej jest pomijany');
ok(resolveClientIp('2001:db8::1', '198.51.100.7, 10.9.9.9') === '198.51.100.7', 'łańcuch zaufanych proxy');
ok(resolveClientIp('10.1.2.3', 'nie-adres') === '10.1.2.3', 'śmieci w nagłówku → adres proxy');
process.exit(finish() ? 1 : 0);
