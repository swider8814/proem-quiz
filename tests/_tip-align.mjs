// Wspólny pomiar: o ile środek przycisku „?” odbiega od środka tekstu etykiety w tej samej linii.
export async function tipOffsets(page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('.helptip')].filter((t) => t.getClientRects().length).map((t) => {
			const q = t.querySelector('button.q').getBoundingClientRect();
			// tekst etykiety = ostatni niepusty węzeł tekstowy przed „?” w tym samym rodzicu (lub w etykiecie obok)
			let n = t.previousSibling;
			while (n && !(n.nodeType === 3 && n.textContent.trim()) && !(n.nodeType === 1 && n.textContent.trim())) n = n.previousSibling;
			if (!n) return { id: t.parentElement?.textContent?.trim().slice(0, 20), diff: null };
			const r = document.createRange();
			r.selectNodeContents(n);
			const rects = [...r.getClientRects()];
			const line = rects[rects.length - 1];
			return { id: (n.textContent ?? '').trim().slice(0, 24), diff: Math.round((q.top + q.height / 2 - (line.top + line.height / 2)) * 10) / 10 };
		})
	);
}
