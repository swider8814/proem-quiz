import { error, fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { deleteUserSessions, resetTotp } from '#lib/server/auth/index.js';
import { createInvite, inviteUrl, inviteUser, isValidEmail } from '#lib/server/users.js';

function requireAdmin(locals: App.Locals) {
	if (locals.user?.role !== 'admin') error(403, 'Tylko dla administratorów');
	return locals.user;
}

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	const users = db
		.select({
			id: schema.users.id,
			name: schema.users.name,
			email: schema.users.email,
			role: schema.users.role,
			totpEnabled: schema.users.totpEnabled,
			disabled: schema.users.disabled,
			activated: schema.users.passwordHash
		})
		.from(schema.users)
		.orderBy(asc(schema.users.name))
		.all()
		.map((u) => ({ ...u, activated: !!u.activated }));
	return { users };
};

const getTarget = (id: string) => db.select().from(schema.users).where(eq(schema.users.id, id)).get();

export const actions: Actions = {
	invite: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const email = String(f.get('email') ?? '').trim();
		const name = String(f.get('name') ?? '').trim();
		const role = f.get('role') === 'admin' ? 'admin' : 'author';
		if (!isValidEmail(email)) return fail(400, { inviteError: 'Podaj poprawny e-mail.', email, name, role });
		if (name.length < 2) return fail(400, { inviteError: 'Podaj imię i nazwisko.', email, name, role });
		const res = inviteUser({ email, name, role });
		if ('error' in res) return fail(400, { inviteError: res.error, email, name, role });
		return { link: inviteUrl(url.origin, res.token), linkFor: res.user.name };
	},

	reinvite: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const target = getTarget(String((await request.formData()).get('id')));
		if (!target) return fail(404, { actionError: 'Nie znaleziono konta.' });
		return { link: inviteUrl(url.origin, createInvite(target.id)), linkFor: target.name };
	},

	role: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const f = await request.formData();
		const target = getTarget(String(f.get('id')));
		if (!target) return fail(404, { actionError: 'Nie znaleziono konta.' });
		if (target.id === me.id) return fail(400, { actionError: 'Nie możesz zmienić własnej roli.' });
		const role = f.get('role') === 'admin' ? 'admin' : 'author';
		db.update(schema.users).set({ role }).where(eq(schema.users.id, target.id)).run();
		// Nowy admin musi przy następnym wejściu skonfigurować TOTP (wymusza to hooks.server.ts).
		return { message: `${target.name}: rola zmieniona na ${role === 'admin' ? 'administrator' : 'autor'}.` };
	},

	toggle: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const target = getTarget(String((await request.formData()).get('id')));
		if (!target) return fail(404, { actionError: 'Nie znaleziono konta.' });
		if (target.id === me.id) return fail(400, { actionError: 'Nie możesz zablokować własnego konta.' });
		db.update(schema.users).set({ disabled: !target.disabled }).where(eq(schema.users.id, target.id)).run();
		if (!target.disabled) deleteUserSessions(target.id);
		return { message: `${target.name}: konto ${target.disabled ? 'odblokowane' : 'zablokowane'}.` };
	},

	reset2fa: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const target = getTarget(String((await request.formData()).get('id')));
		if (!target) return fail(404, { actionError: 'Nie znaleziono konta.' });
		if (target.id === me.id) return fail(400, { actionError: 'Własnej weryfikacji nie resetujesz tutaj – użyj „Bezpieczeństwo”.' });
		resetTotp(target.id);
		return { message: `${target.name}: weryfikacja dwuetapowa zresetowana, sesje wylogowane.` };
	}
};
