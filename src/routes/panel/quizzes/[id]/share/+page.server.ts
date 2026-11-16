import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { canManageShares, listShares, quizAccess, setShare } from '#lib/server/quizzes.js';

function guard(locals: App.Locals, quizId: string) {
	const user = locals.user!;
	const access = quizAccess(user, quizId);
	if (!access) error(404, 'Nie znaleziono quizu.');
	if (!canManageShares(user, access)) error(403, 'Udostępniać może tylko właściciel quizu albo administrator.');
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
		if (typeof userId !== 'string' || userId.length > 64 || permission === undefined) return fail(400, { error: 'Niepoprawne dane.' });
		const err = setShare(user, params.id, userId, permission);
		if (err) return fail(400, { error: err });
		return { ok: true };
	}
};
