import { randomInt } from 'node:crypto';

// Przymiotnik + zwierzę (rodzaj męski – zgodność form).
const WORDS = {
	pl: {
		adj: ['Szybki', 'Wesoły', 'Dzielny', 'Mądry', 'Sprytny', 'Bystry', 'Odważny', 'Radosny', 'Skoczny', 'Cichy', 'Zwinny', 'Pogodny', 'Złoty', 'Kolorowy', 'Uśmiechnięty', 'Ciekawski', 'Pomysłowy', 'Silny', 'Spokojny', 'Wspaniały'],
		noun: ['Bóbr', 'Jeż', 'Lis', 'Sokół', 'Żubr', 'Borsuk', 'Delfin', 'Miś', 'Kangur', 'Pingwin', 'Królik', 'Słoń', 'Tygrys', 'Lew', 'Wilk', 'Orzeł', 'Żółw', 'Kot', 'Bocian', 'Łoś', 'Dzik', 'Gepard', 'Koala', 'Struś']
	},
	en: {
		adj: ['Swift', 'Happy', 'Brave', 'Clever', 'Smart', 'Bright', 'Bold', 'Jolly', 'Bouncy', 'Quiet', 'Nimble', 'Sunny', 'Golden', 'Colourful', 'Smiling', 'Curious', 'Witty', 'Strong', 'Calm', 'Mighty'],
		noun: ['Beaver', 'Hedgehog', 'Fox', 'Falcon', 'Bison', 'Badger', 'Dolphin', 'Bear', 'Kangaroo', 'Penguin', 'Rabbit', 'Elephant', 'Tiger', 'Lion', 'Wolf', 'Eagle', 'Turtle', 'Cat', 'Stork', 'Moose', 'Owl', 'Cheetah', 'Koala', 'Otter']
	},
	uk: {
		adj: ['Швидкий', 'Веселий', 'Хоробрий', 'Мудрий', 'Спритний', 'Кмітливий', 'Відважний', 'Радісний', 'Стрибучий', 'Тихий', 'Моторний', 'Сонячний', 'Золотий', 'Яскравий', 'Усміхнений', 'Допитливий', 'Винахідливий', 'Сильний', 'Спокійний', 'Чудовий'],
		noun: ['Бобер', 'Їжак', 'Лис', 'Сокіл', 'Зубр', 'Борсук', 'Дельфін', 'Ведмідь', 'Кенгуру', 'Пінгвін', 'Кролик', 'Слон', 'Тигр', 'Лев', 'Вовк', 'Орел', 'Кіт', 'Лелека', 'Лось', 'Гепард', 'Коала', 'Страус']
	}
};

/** @param {'pl'|'en'|'uk'} locale @param {Set<string>} taken nicki już w grze (małymi literami) */
export function randomNick(locale, taken) {
	const w = WORDS[locale] ?? WORDS.pl;
	for (let i = 0; i < 50; i++) {
		const nick = `${w.adj[randomInt(w.adj.length)]} ${w.noun[randomInt(w.noun.length)]}`;
		if (!taken.has(nick.toLowerCase())) return nick;
	}
	return `${w.adj[randomInt(w.adj.length)]} ${w.noun[randomInt(w.noun.length)]} ${randomInt(10, 99)}`;
}
