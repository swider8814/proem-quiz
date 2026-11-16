import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Sekret TOTP trzymamy w bazie zaszyfrowany (AES-256-GCM). Klucz tylko w .env.
function key(): Buffer {
	const raw = process.env.TOTP_ENCRYPTION_KEY;
	if (raw) {
		const k = Buffer.from(raw, 'base64');
		if (k.length !== 32) throw new Error('TOTP_ENCRYPTION_KEY musi mieć 32 bajty (base64)');
		return k;
	}
	if (process.env.NODE_ENV === 'production') {
		throw new Error('Brak TOTP_ENCRYPTION_KEY w .env');
	}
	return createHash('sha256').update('proem-quiz-dev-only').digest();
}

export function encrypt(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string): string {
	const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
	const decipher = createDecipheriv('aes-256-gcm', key(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const newId = (prefix: string) => `${prefix}_${randomBytes(10).toString('base64url')}`;
