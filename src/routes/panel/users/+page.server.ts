import { error, fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { deleteUserSessions, resetTotp } from '#lib/server/auth/index.js';
import { createInvite, inviteUrl, inviteUser, isValidEmail } from '#lib/server/users.js';
import { inviteMail, mailConfigured, sendMail } from '#lib/server/mail.js';
import { isPanelLang, panelDict } from '#lib/i18n/panel.js';

function requireAdmin(locals: App.Locals) {
	if (locals.user?.role !== 'admin') error(403, panelDict(locals.lang).err.adminsOnly);
	return locals.user;
}

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	const mail = mailConfigured();
	const users = db
		.select({
			id: schema.users.id,
			name: schema.users.name,
			email: schema.users.email,
			role: schema.users.role,
			totpEnabled: schema.users.totpEnabled,
			disabled: schema.users.disabled,
			activated: schema.users.passwordHash,
			locale: schema.users.locale
		})
		.from(schema.users)
		.orderBy(asc(schema.users.name))
		.all()
		.map((u) => ({ ...u, activated: !!u.activated }));
	return { users, mail };
};

const getTarget = (id: string) => db.select().from(schema.users).where(eq(schema.users.id, id)).get();

export const actions: Actions = {
	invite: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const email = String(f.get('email') ?? '').trim();
		const name = String(f.get('name') ?? '').trim();
		const role = f.get('role') === 'admin' ? 'admin' : 'author';
		const locale = f.get('locale') === 'en' ? 'en' : 'pl';
		const t = panelDict(locals.lang).err;
		if (!isValidEmail(email)) return fail(400, { inviteError: t.badEmail, email, name, role, locale });
		if (name.length < 2) return fail(400, { inviteError: t.giveName, email, name, role, locale });
		const res = inviteUser({ email, name, role, locale });
		if ('error' in res) return fail(400, { inviteError: t.accountExists, email, name, role, locale });
		const link = inviteUrl(url.origin, res.token);
		const mailed = await sendMail(inviteMail(res.user.email, res.user.name, locals.user!.name, link, res.user.locale));
		return { link, linkFor: res.user.name, mailed };
	},

	reinvite: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const target = getTarget(String((await request.formData()).get('id')));
		const t = panelDict(locals.lang).err;
		if (!target) return fail(404, { actionError: t.accountNotFound });
		// Link aktywacyjny tylko dla kont bez hasła (inaczej działałby jak reset hasła z panelu).
		if (target.passwordHash) return fail(400, { actionError: t.alreadyActive });
		const link = inviteUrl(url.origin, createInvite(target.id));
		const mailed = await sendMail(inviteMail(target.email, target.name, locals.user!.name, link, target.locale));
		return { link, linkFor: target.name, mailed };
	},

	role: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const f = await request.formData();
		const target = getTarget(String(f.get('id')));
		const t = panelDict(locals.lang);
		if (!target) return fail(404, { actionError: t.err.accountNotFound });
		if (target.id === me.id) return fail(400, { actionError: t.err.ownRole });
		const role = f.get('role') === 'admin' ? 'admin' : 'author';
		db.update(schema.users).set({ role }).where(eq(schema.users.id, target.id)).run();
		// Zmiana uprawnień = nowe logowanie (admin musi przejść 2FA / jego konfigurację).
		deleteUserSessions(target.id);
		// Nowy admin musi przy następnym wejściu skonfigurować TOTP (wymusza to hooks.server.ts).
		return { message: t.users.roleChanged(target.name, role === 'admin') };
	},

	toggle: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const target = getTarget(String((await request.formData()).get('id')));
		const t = panelDict(locals.lang);
		if (!target) return fail(404, { actionError: t.err.accountNotFound });
		if (target.id === me.id) return fail(400, { actionError: t.err.ownBlock });
		db.update(schema.users).set({ disabled: !target.disabled }).where(eq(schema.users.id, target.id)).run();
		if (!target.disabled) deleteUserSessions(target.id);
		return { message: t.users.toggled(target.name, !target.disabled) };
	},

	reset2fa: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const target = getTarget(String((await request.formData()).get('id')));
		const t = panelDict(locals.lang);
		if (!target) return fail(404, { actionError: t.err.accountNotFound });
		if (target.id === me.id) return fail(400, { actionError: t.err.own2fa });
		resetTotp(target.id);
		return { message: t.users.reset2faDone(target.name) };
	},

	locale: async ({ request, locals }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const target = getTarget(String(f.get('id')));
		const locale = f.get('locale');
		if (!target) return fail(404, { actionError: panelDict(locals.lang).err.accountNotFound });
		if (!isPanelLang(locale)) return fail(400, { actionError: panelDict(locals.lang).err.invalid });
		db.update(schema.users).set({ locale }).where(eq(schema.users.id, target.id)).run();
		return {};
	}
};
