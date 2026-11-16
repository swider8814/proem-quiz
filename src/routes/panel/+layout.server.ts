import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const u = locals.user!;
	return {
		user: { id: u.id, name: u.name, email: u.email, role: u.role, totpEnabled: u.totpEnabled }
	};
};
