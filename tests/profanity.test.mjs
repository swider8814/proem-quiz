import { isProfane } from '../server/game/profanity.js';
const bad = ['kurwa','K.U.R.W.A','kurrrwa','kvrwa','k0rwa','ku rwa','Chuj','huj123','pierdolony','jebać','pizda','fuck','FUUUCK','f.u.c.k','sh1t','bitch','nigger','nigga','asshole','хуй','блядь','сука','пиздец','blyat','кurwa','Dupa','debil','sex','Seksowna'];
const good = ['Kasia','Michał','Szybki Bóbr','Wesoła Sowa','Sebastian','Analiza','Grape','Dickens','Hubert','Scipio','Ola K.','Олена','Тарас','потреба','хлеба','корабля','Essex','Cucumber','Zuzia 🦊','Bartek','Kuba'];
let fails=0;
for (const b of bad) if(!isProfane(b)){console.log('MISSED',b);fails++}
for (const g of good) if(isProfane(g)){console.log('FALSE+',g);fails++}
console.log('fails',fails); process.exit(fails?1:0);
