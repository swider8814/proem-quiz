import type { PageServerLoad } from './$types';
import { remainingRecoveryCodes } from '#lib/server/auth/index.js';

export const load: PageServerLoad = ({ locals, url }) => ({
	remainingCodes: locals.user!.totpEnabled ? remainingRecoveryCodes(locals.user!.id) : 0,
	recoveryUsed: url.searchParams.has('recovery-used')
});
