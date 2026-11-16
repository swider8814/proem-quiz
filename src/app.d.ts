import type { Session, User } from '#lib/server/auth/index.js';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			session: Session | null;
		}
	}
}

export {};
