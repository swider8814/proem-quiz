import type { Session, User } from '#lib/server/auth/index.js';
import type { PanelLang } from '#lib/i18n/panel.js';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			session: Session | null;
			/** Język panelu: konto → ciasteczko → przeglądarka. */
			lang: PanelLang;
		}
		interface PageState {
			/** /play: dodatkowy wpis w historii, żeby „wstecz” nie wyrzucało z gry. */
			guard?: boolean;
		}
	}
}

export {};
