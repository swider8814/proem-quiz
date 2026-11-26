import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { deleteUserSessions, resetTotp } from '#lib/server/auth/index.js';
import { cleanName, createInvite, inviteUrl, inviteUser, isValidEmail, renameUser } from '#lib/server/users.js';
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
		const rawName = String(f.get('name') ?? '').trim();
		const name = cleanName(rawName) ?? rawName;
		const role = f.get('role') === 'admin' ? 'admin' : 'author';
		const rawLocale = f.get('locale');
		const locale = isPanelLang(rawLocale) ? rawLocale : 'pl';
		const t = panelDict(locals.lang).err;
		if (!isValidEmail(email)) return fail(400, { inviteError: t.badEmail, email, name, role, locale });
		if (!cleanName(name)) return fail(400, { inviteError: t.giveName, email, name, role, locale });
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

	// Usunięcie tylko konta, które nigdy nie zostało aktywowane (literówka w e-mailu, nieprzyjęte
	// zaproszenie). Aktywne konta mają quizy i pliki – te się blokuje. Warunek „bez hasła” jest
	// w samym DELETE, więc konto aktywowane w międzyczasie (wyścig z linkiem) nie zostanie usunięte.
	delete: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const target = getTarget(String((await request.formData()).get('id')));
		const t = panelDict(locals.lang);
		if (!target) return fail(404, { actionError: t.err.accountNotFound });
		if (target.id === me.id) return fail(400, { actionError: t.err.ownDelete });
		if (target.passwordHash) return fail(400, { actionError: t.err.onlyPendingDelete });
		let removed = 0;
		try {
			// Zaproszenia, sesje i udostępnienia znikają kaskadowo (ON DELETE CASCADE).
			removed = db
				.delete(schema.users)
				.where(and(eq(schema.users.id, target.id), isNull(schema.users.passwordHash)))
				.run().changes;
		} catch {
			// Klucz obcy bez kaskady (quiz, plik, słowo w filtrze) – nie usuwamy, tylko zgłaszamy.
			return fail(409, { actionError: t.err.onlyPendingDelete });
		}
		if (!removed) return fail(409, { actionError: t.err.onlyPendingDelete });
		return { message: t.users.deleted(target.name) };
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

	// Zmiana imienia i nazwiska (np. po ślubie, literówka) – także własnego.
	rename: async ({ request, locals }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const target = getTarget(String(f.get('id')));
		const t = panelDict(locals.lang);
		if (!target) return fail(404, { actionError: t.err.accountNotFound });
		const name = cleanName(f.get('name'));
		if (!name) return fail(400, { actionError: t.err.giveName, renameId: target.id });
		renameUser(target.id, name);
		if (target.id === locals.user!.id) locals.user!.name = name;
		return { message: t.users.renamed(target.name, name) };
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
