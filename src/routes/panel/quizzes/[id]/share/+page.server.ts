import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { canManageShares, listShares, quizAccess, setShare } from '#lib/server/quizzes.js';
import { panelDict } from '#lib/i18n/panel.js';

function guard(locals: App.Locals, quizId: string) {
	const user = locals.user!;
	const access = quizAccess(user, quizId);
	const t = panelDict(locals.lang).err;
	if (!access) error(404, t.quizNotFound);
	if (!canManageShares(user, access)) error(403, t.shareForbidden);
	return user;
}

export const load: PageServerLoad = ({ params, locals }) => {
	guard(locals, params.id);
	const quiz = db.select({ id: schema.quizzes.id, title: schema.quizzes.title, ownerId: schema.quizzes.ownerId, ownerName: schema.users.name })
		.from(schema.quizzes)
		.innerJoin(schema.users, eq(schema.quizzes.ownerId, schema.users.id))
		.where(eq(schema.quizzes.id, params.id))
		.get()!;
	const shares = listShares(params.id);
	const sharedIds = new Set(shares.map((s) => s.userId));
	const candidates = db
		.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
		.from(schema.users)
		.where(and(ne(schema.users.id, quiz.ownerId), eq(schema.users.disabled, false)))
		.orderBy(asc(schema.users.name))
		.all()
		.filter((u) => !sharedIds.has(u.id));
	return { quiz, shares, candidates };
};

const permissionOf = (v: FormDataEntryValue | null) => (v === 'host' || v === 'edit' ? v : undefined);

export const actions: Actions = {
	set: async ({ request, params, locals }) => {
		const user = guard(locals, params.id);
		const f = await request.formData();
		const userId = f.get('userId');
		const permission = f.get('remove') === '1' ? null : permissionOf(f.get('permission'));
		if (typeof userId !== 'string' || userId.length > 64 || permission === undefined) return fail(400, { error: panelDict(locals.lang).err.invalid });
		const err = setShare(user, params.id, userId, permission);
		if (err) return fail(400, { error: panelDict(locals.lang).err[err] });
		return { ok: true };
	}
};
