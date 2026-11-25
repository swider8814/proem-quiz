import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Strona główna = dołączanie do gry (tam trafiają uczestnicy wpisujący sam adres).
export const load: PageServerLoad = () => redirect(307, '/play');
