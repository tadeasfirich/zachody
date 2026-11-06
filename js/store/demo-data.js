// Generátor ukázkových dat pro demo režim: 19 tříd, smyšlení žáci, 4 týdny provozu.
// Schovaná dvojice (8.A + 8.B) způsobuje většinu škod na 2. patře – analýza překryvu ji má najít.
// Několik žáků chodí na toaletu velmi často (jako by měli zdravotní důvod) – analýza je NESMÍ vytáhnout nahoru.

import { defaultRef, randomToken } from './schema.js';
import { slotsForDay, lessons, breaks, atMin, startOfDay, addDays, isSchoolDay, isoDay, dateKey } from '../time.js';
import { computeWindow, visitsInWindow } from '../logic.js';

const DOMAIN = 'skola.libcice.cz';

// Testovací účty. Všechny role, které budou v ostré aplikaci; v přepínači se mezi nimi jde proklikávat.
export const DEMO_USERS = [
  { role: 'spravce', name: 'Tadeáš Firich', email: `tadeas.firich@${DOMAIN}`, hint: 'správce – všechny tři aplikace, nastavení, import žáků' },
  { role: 'vedeni', name: 'pan Švarc', email: `svarc@${DOMAIN}`, hint: 'vedení – dostává upozornění; všechny aplikace, správu bez nastavení' },
  { role: 'vedeni', name: 'Petr Kalina', email: `petr.kalina@${DOMAIN}`, hint: 'vedení – zástupce, má i dozory' },
  { role: 'ucitel', name: 'Eva Malá', email: `eva.mala@${DOMAIN}`, hint: 'učitelka – dnes má dozor na 2. a 1. patře' },
  { role: 'ucitel', name: 'Jiří Novotný', email: `jiri.novotny@${DOMAIN}`, hint: 'učitel na dozoru' },
  { role: 'ucitel', name: 'Lucie Dvořáková', email: `lucie.dvorakova@${DOMAIN}`, hint: 'učitelka na dozoru' },
  { role: 'ucitel', name: 'Radek Marek', email: `radek.marek@${DOMAIN}`, hint: 'učitel – v ukázkových datech často zapomíná na kontrolu' },
  { role: 'uklid', name: 'Marie Procházková', email: `marie.prochazkova@${DOMAIN}`, hint: 'uklízečka – ranní a odpolední úklid' },
  { role: 'uklid', name: 'Jana Kubíčková', email: `jana.kubickova@${DOMAIN}`, hint: 'uklízečka' },
  { role: 'ucebna', name: 'Tablet 1.A', email: `ucebna.1a@${DOMAIN}`, ucebna: 'u-1A', hint: 'kmenová 1.A, přízemí' },
  { role: 'ucebna', name: 'Tablet 4.A', email: `ucebna.4a@${DOMAIN}`, ucebna: 'u-4A', hint: 'kmenová 4.A, 1. patro' },
  { role: 'ucebna', name: 'Tablet 7.B', email: `ucebna.7b@${DOMAIN}`, ucebna: 'u-7B', hint: 'kmenová 7.B, 2. patro' },
  { role: 'ucebna', name: 'Tablet 8.A', email: `ucebna.8a@${DOMAIN}`, ucebna: 'u-8A', hint: 'kmenová 8.A, 2. patro – semináře 8.A + 8.B' },
  { role: 'ucebna', name: 'Tablet 8.B', email: `ucebna.8b@${DOMAIN}`, ucebna: 'u-8B', hint: 'kmenová 8.B, 2. patro' },
  { role: 'ucebna', name: 'Tablet IT učebna', email: `ucebna.it@${DOMAIN}`, ucebna: 'u-IT', hint: 'IT učebna, 2. patro – střídají se tu třídy' },
];

const TEACHERS = [
  ['Tadeáš Firich', 0.95], ['Petr Kalina', 0.9], ['Eva Malá', 0.92], ['Jiří Novotný', 0.88],
  ['Lucie Dvořáková', 0.93], ['Martin Král', 0.85], ['Hana Svobodová', 0.9], ['Tomáš Beneš', 0.87],
  ['Klára Horáková', 0.94], ['Ondřej Pokorný', 0.8], ['Simona Veselá', 0.91], ['Radek Marek', 0.52],
].map(([name, rel]) => ({ name, rel, email: emailOf(name) }));

const M_FIRST = ['Adam', 'Jakub', 'Jan', 'Tomáš', 'Matyáš', 'Vojtěch', 'Filip', 'David', 'Ondřej', 'Lukáš', 'Matěj', 'Šimon', 'Daniel', 'Petr', 'Martin', 'Antonín', 'Tobiáš', 'Michal', 'Jiří', 'Václav', 'Sebastián', 'Eliáš', 'Viktor', 'Patrik'];
const F_FIRST = ['Eliška', 'Anna', 'Tereza', 'Adéla', 'Natálie', 'Sofie', 'Karolína', 'Viktorie', 'Kristýna', 'Barbora', 'Klára', 'Ema', 'Nela', 'Julie', 'Lucie', 'Amálie', 'Rozálie', 'Veronika', 'Markéta', 'Zuzana', 'Laura', 'Michaela', 'Sára', 'Linda'];
const SURN = [['Novák', 'Nováková'], ['Svoboda', 'Svobodová'], ['Novotný', 'Novotná'], ['Dvořák', 'Dvořáková'], ['Černý', 'Černá'], ['Procházka', 'Procházková'], ['Kučera', 'Kučerová'], ['Veselý', 'Veselá'], ['Horák', 'Horáková'], ['Němec', 'Němcová'], ['Marek', 'Marková'], ['Pospíšil', 'Pospíšilová'], ['Hájek', 'Hájková'], ['Jelínek', 'Jelínková'], ['Král', 'Králová'], ['Růžička', 'Růžičková'], ['Beneš', 'Benešová'], ['Fiala', 'Fialová'], ['Sedláček', 'Sedláčková'], ['Doležal', 'Doležalová'], ['Zeman', 'Zemanová'], ['Kolář', 'Kolářová'], ['Navrátil', 'Navrátilová'], ['Čermák', 'Čermáková'], ['Urban', 'Urbanová'], ['Vaněk', 'Vaňková'], ['Blažek', 'Blažková'], ['Kříž', 'Křížová'], ['Kovář', 'Kovářová'], ['Bartoš', 'Bartošová'], ['Vlček', 'Vlčková'], ['Polák', 'Poláková'], ['Musil', 'Musilová'], ['Kopecký', 'Kopecká'], ['Šimek', 'Šimková'], ['Konečný', 'Konečná'], ['Malý', 'Malá'], ['Holub', 'Holubová'], ['Štěpánek', 'Štěpánková'], ['Kadlec', 'Kadlecová']];

const lessonsFor = (rocnik, wd) => (rocnik <= 2 ? 4 : rocnik <= 5 ? 5 : rocnik <= 7 ? 6 : (wd === 2 || wd === 4 ? 7 : 6));

// Ukázkový rozvrh: kmenové učebny mají svou třídu, út a čt 5. hodinu je seminář 8.A + 8.B v učebně 8.A
// (učebna 8.B má volno). IT učebna má pár hodin, jazyková učebna je nevyplněná (učitel vybírá sám).
export function demoRozvrh(ref) {
  const out = [];
  const add = (ucebna, den, hodina, tridy, volno = false) => {
    const id = `${ucebna}|${den}|${hodina}`;
    const i = out.findIndex((x) => x.id === id);
    const row = { id, ucebna, den, hodina, tridy, volno };
    if (i >= 0) out[i] = row; else out.push(row);
  };
  for (const t of ref.tridy) {
    const room = `u-${t.nazev.replace('.', '')}`;
    if (!ref.ucebny.some((u) => u.id === room)) continue;
    for (let den = 1; den <= 5; den++) {
      for (let hod = 1; hod <= lessonsFor(t.rocnik, den); hod++) add(room, den, hod, [t.nazev]);
    }
  }
  for (const den of [2, 4]) { add('u-8A', den, 5, ['8.A', '8.B']); add('u-8B', den, 5, [], true); }
  if (ref.ucebny.some((u) => u.id === 'u-IT')) {
    for (const [den, hod, tr] of [[1, 3, '6.A'], [2, 2, '7.B'], [3, 4, '8.A'], [4, 3, '9.B'], [5, 1, '5.A'], [5, 2, '6.B']]) {
      add('u-IT', den, hod, [tr]);
      add(`u-${tr.replace('.', '')}`, den, hod, [], true);
    }
  }
  return out;
}

const CLASS_NAMES = ['1.A', '1.B', '2.A', '2.B', '3.A', '3.B', '4.A', '4.B', '5.A', '5.B', '6.A', '6.B', '6.C', '7.A', '7.B', '8.A', '8.B', '9.A', '9.B'];
const floorOf = (rocnik) => (rocnik <= 3 ? 0 : rocnik <= 6 ? 1 : 2);

function emailOf(name) {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(' ');
  return `${n[0]}.${n[n.length - 1]}@${DOMAIN}`;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemo(now = new Date()) {
  const R = rng(20261021);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const between = (a, b) => a + R() * (b - a);
  let seq = 0;
  const id = (p) => `${p}-${(++seq).toString(36)}-${Math.floor(R() * 1e6).toString(36)}`;

  const ref = defaultRef();
  ref.toalety.forEach((t, i) => { t.qrToken = `demo${i}${randomToken().slice(0, 4)}`; });

  // třídy, učebny, žáci
  ref.tridy = CLASS_NAMES.map((n) => ({ id: n, nazev: n, rocnik: Number(n.split('.')[0]), aktivni: true }));
  ref.ucebny = ref.tridy.map((t) => ({
    id: `u-${t.nazev.replace('.', '')}`, nazev: `Kmenová ${t.nazev}`, patro: floorOf(t.rocnik),
    ucet: `ucebna.${t.nazev.replace('.', '').toLowerCase()}@${DOMAIN}`, maxVenku: 1, pin: '', aktivni: true,
  }));
  ref.ucebny.push({ id: 'u-IT', nazev: 'IT učebna', patro: 2, ucet: `ucebna.it@${DOMAIN}`, maxVenku: 1, pin: '', aktivni: true });
  ref.ucebny.push({ id: 'u-JAZ', nazev: 'Jazyková učebna', patro: 1, ucet: `ucebna.jazyky@${DOMAIN}`, maxVenku: 1, pin: '', aktivni: true });

  const zaci = [];
  const usedNames = new Set();
  for (const t of ref.tridy) {
    const n = 19 + Math.floor(R() * 7);
    for (let i = 0; i < n; i++) {
      const male = R() < 0.5;
      let jmeno, prijmeni, key;
      do {
        jmeno = pick(male ? M_FIRST : F_FIRST);
        const s = pick(SURN); prijmeni = male ? s[0] : s[1];
        key = `${t.nazev}|${jmeno}|${prijmeni}`;
      } while (usedNames.has(key));
      usedNames.add(key);
      zaci.push({ id: id('z'), jmeno, prijmeni, trida: t.nazev, typWC: male ? 'CH' : 'D', aktivni: true, importId: '' });
    }
  }
  // schovaná dvojice
  const pairA = { id: 'z-pair-a', jmeno: 'Kryštof', prijmeni: 'Bartoš', trida: '8.A', typWC: 'CH', aktivni: true, importId: '' };
  const pairB = { id: 'z-pair-b', jmeno: 'Dominik', prijmeni: 'Šťastný', trida: '8.B', typWC: 'CH', aktivni: true, importId: '' };
  zaci.push(pairA, pairB);
  // častí návštěvníci (bez jakékoli poznámky – aplikace o důvodech nic neví)
  const frequent = new Set();
  for (const tr of ['7.B', '8.A', '9.A', '4.B']) {
    const cand = zaci.filter((z) => z.trida === tr && z.typWC === 'CH' && !z.id.startsWith('z-pair'));
    if (cand.length) frequent.add(pick(cand).id);
  }
  ref.zaci = zaci;

  // plán dozorů: po–pá × přestávka 1–6 × patro
  ref.planDozoru = [];
  let rr = 0;
  for (let den = 1; den <= 5; den++) for (let p = 1; p <= 6; p++) for (let patro = 0; patro <= 2; patro++) {
    const t = TEACHERS[rr++ % TEACHERS.length];
    ref.planDozoru.push({ id: `d${den}-${p}-${patro}`, den, prestavka: p, patro, ucitel: t.email, jmeno: t.name });
  }
  // Tadeáš a Eva mají dnes (středa) dozor na 2. patře – aby šlo vyzkoušet „Moje dozory“
  const setDuty = (den, p, patro, name) => {
    const t = TEACHERS.find((x) => x.name === name);
    const d = ref.planDozoru.find((x) => x.den === den && x.prestavka === p && x.patro === patro);
    d.ucitel = t.email; d.jmeno = t.name;
  };
  const todayWd = Math.min(isoDay(now), 5);
  setDuty(todayWd, 2, 2, 'Tadeáš Firich'); setDuty(todayWd, 4, 2, 'Tadeáš Firich');
  setDuty(todayWd, 3, 2, 'Eva Malá'); setDuty(todayWd, 5, 1, 'Eva Malá');

  // dny bez provozu (státní svátek + podzimní prázdniny 2026)
  ref.dnyBezProvozu = [
    { id: 'dbp1', datum: '2026-10-28', duvod: 'Státní svátek' },
    { id: 'dbp2', datum: '2026-10-29', duvod: 'Podzimní prázdniny' },
    { id: 'dbp3', datum: '2026-10-30', duvod: 'Podzimní prázdniny' },
  ];

  const L = lessons(ref.zvoneni);
  const BR = breaks(ref.zvoneni);
  ref.rozvrh = demoRozvrh(ref);
  const roomOfClass = (tr) => `u-${tr.replace('.', '')}`;
  const roomFloor = new Map(ref.ucebny.map((u) => [u.id, u.patro]));
  const roomEmail = new Map(ref.ucebny.map((u) => [u.id, u.ucet]));
  const wcId = (patro, typ) => `${patro === 0 ? 'P' : patro}-${typ}`;

  // školní dny: 20 dní zpět + dnes
  const days = [];
  for (let k = 40; k >= 0; k--) {
    const d = startOfDay(addDays(now, -k));
    if (isSchoolDay(d, ref.dnyBezProvozu)) days.push(d);
  }
  const lastDays = days.slice(-26);
  const pairDays = new Set();
  const pastDays = lastDays.filter((d) => dateKey(d) !== dateKey(now));
  while (pairDays.size < 10) pairDays.add(dateKey(pick(pastDays)));
  // zvýšený dohled na 2. patře: 5 školních dní v polovině období
  const zdDays = pastDays.slice(13, 18);
  ref.zvysenyDohled = [{
    id: 'zd1', patro: 2, od: dateKey(zdDays[0]), do: dateKey(zdDays[zdDays.length - 1]), duvod: 'Opakované škody na chlapeckých toaletách 2. patro',
  }];

  const relace = [], navstevy = [], damage = [];
  const visitorsTeachers = TEACHERS.slice(2);

  for (const day of lastDays) {
    const wd = isoDay(day);
    const dk = dateKey(day);
    const isPairDay = pairDays.has(dk);
    let pairLesson = isPairDay ? 2 + Math.floor(R() * 4) : null; // 2.–5. hodina
    const isZd = zdDays.some((d) => dateKey(d) === dk);
    const pairOnBreak = isPairDay && isZd && R() < 0.6;
    if (pairOnBreak) pairLesson = null;

    for (const l of L) {
      // seminář: út a čt 5. hodina 8.A + 8.B spolu v učebně 8.A
      const seminar = (wd === 2 || wd === 4) && l.hodina === 5;
      const groups = [];
      for (const t of ref.tridy) {
        if (l.hodina > lessonsFor(t.rocnik, wd)) continue;
        if (seminar && t.nazev === '8.B') continue;
        const tr = seminar && t.nazev === '8.A' ? ['8.A', '8.B'] : [t.nazev];
        groups.push({ room: roomOfClass(t.nazev), tridy: tr });
      }
      for (const g of groups) {
        const relId = id('rel');
        relace.push({
          id: relId, ucebna: g.room, tridy: g.tridy, hodina: String(l.hodina),
          zacatek: atMin(day, l.od + 1).toISOString(), konec: atMin(day, l.do).toISOString(),
          spustil: pick(visitorsTeachers).email, puvod: 'rozvrh', rozvrhTridy: g.tridy, zmenil: '', zmenaCas: null,
        });
        const floor = roomFloor.get(g.room);
        const kids = zaci.filter((z) => g.tridy.includes(z.trida));
        const cand = [];
        for (const z of kids) {
          if (z.id.startsWith('z-pair')) continue; // dvojici řešíme zvlášť
          const p = frequent.has(z.id) ? 0.38 : 0.045;
          if (R() < p) cand.push(z);
        }
        const slots = [];
        const free = (s, e) => !slots.some(([a, b]) => s < b + 0.5 && e > a - 0.5);
        cand.sort(() => R() - 0.5);
        for (const z of cand) {
          const s = between(l.od + 3, l.do - 9);
          const dur = between(3, 8);
          if (!free(s, s + dur)) continue;
          slots.push([s, s + dur]);
          navstevy.push(mkVisit(z, wcId(floor, z.typWC), day, s, s + dur, g.room, relId));
        }
      }
    }

    // schovaná dvojice: v jedné hodině odejdou krátce po sobě na 2. patro chlapci
    if (pairLesson) {
      const l = L.find((x) => x.hodina === pairLesson);
      const together = (wd === 2 || wd === 4) && pairLesson === 5; // seminář ve stejné učebně
      const relOf = (room) => relace.find((r) => r.ucebna === room && r.hodina === String(pairLesson) && dateKey(r.zacatek) === dk);
      const sA = between(l.od + 6, l.do - 22);
      const dA = between(6, 10);
      const roomA = 'u-8A';
      const roomB = together ? 'u-8A' : 'u-8B';
      const sB = together ? sA + dA + between(0.5, 2) : sA + between(1, 4);
      const dB = between(6, 9);
      removeOverlapping(navstevy, roomA, day, sA, sA + dA);
      removeOverlapping(navstevy, roomB, day, sB, sB + dB);
      const rA = relOf(roomA), rB = relOf(roomB);
      navstevy.push(mkVisit(pairA, wcId(2, 'CH'), day, sA, sA + dA, roomA, rA ? rA.id : ''));
      navstevy.push(mkVisit(pairB, wcId(2, 'CH'), day, sB, sB + dB, roomB, rB ? rB.id : ''));
      damage.push({ toaleta: wcId(2, 'CH'), at: atMin(day, Math.max(sA + dA, sB + dB) + 0.5), pair: true });
    }

    // zvýšený dohled: dozor u dveří 2. patra zapisuje vstupy o přestávkách
    if (isZd) {
      const floorKids = zaci.filter((z) => ref.tridy.find((t) => t.nazev === z.trida && floorOf(t.rocnik) === 2));
      for (const b of BR) {
        const dozor = ref.planDozoru.find((p) => p.den === wd && p.prestavka === b.po && p.patro === 2);
        const n = 8 + Math.floor(R() * 7);
        const chosen = new Set();
        while (chosen.size < n) chosen.add(pick(floorKids.filter((z) => !z.id.startsWith('z-pair'))));
        const pairThisBreak = (pairOnBreak && b.po === 3) || (R() < 0.25);
        if (pairThisBreak) { chosen.add(pairA); chosen.add(pairB); }
        for (const z of chosen) {
          const s = between(b.od + 0.5, b.do - 2);
          navstevy.push({
            id: id('n'), zak: z.id, toaleta: wcId(2, z.typWC), casOd: atMin(day, s).toISOString(), casDo: null,
            zdroj: 'dozor', ucebna: '', relace: '', zapsal: dozor ? dozor.ucitel : '', autoUzavreno: false, incident: '',
          });
        }
        if (pairOnBreak && b.po === 3) damage.push({ toaleta: wcId(2, 'CH'), at: atMin(day, b.do - 2), pair: true });
      }
    }

    // náhodné škody jinde (asi každý čtvrtý den)
    if (R() < 0.28) {
      const t = pick(ref.toalety.filter((x) => x.id !== '2-CH'));
      const l = pick(L.slice(0, 6));
      damage.push({ toaleta: t.id, at: atMin(day, between(l.od, l.do + 8)), pair: false });
    }
  }

  function mkVisit(z, toaleta, day, s, e, room, relId) {
    return {
      id: id('n'), zak: z.id, toaleta, casOd: atMin(day, s).toISOString(), casDo: atMin(day, e).toISOString(),
      zdroj: 'tablet', ucebna: room, relace: relId, zapsal: roomEmail.get(room), autoUzavreno: R() < 0.04, incident: '',
    };
  }

  // ---- kontroly ----
  const kontroly = [];
  const cleaner = DEMO_USERS.find((u) => u.role === 'uklid');
  for (const day of lastDays) {
    for (const s of slotsForDay(day, ref)) {
      const t = TEACHERS.find((x) => x.email === s.ucitel);
      const p = s.povinne ? (t ? t.rel : 0.5) : 0.22;
      if (R() > p) continue;
      const tol = Number(ref.nastaveni.toleranceMin);
      const a = s.od.getTime(), z = s.do.getTime() - tol * 60000;
      const cas = new Date(a + R() * (z - a));
      kontroly.push({
        id: id('k'), toaleta: s.toaleta, cas: cas.toISOString(), stav: 'ok', kontroloval: s.ucitel || pick(TEACHERS).email,
        jmeno: t ? t.name : '', role: 'ucitel', slot: `${s.prestavka}|${s.typ}`, poznamka: '',
      });
    }
    for (const t of ref.toalety) {
      for (const m of [between(7 * 60 + 25, 7 * 60 + 45), between(14 * 60 + 35, 15 * 60 + 10)]) {
        kontroly.push({
          id: id('k'), toaleta: t.id, cas: atMin(day, m).toISOString(), stav: 'ok', kontroloval: cleaner.email,
          jmeno: cleaner.name, role: 'uklid', slot: '', poznamka: '',
        });
      }
    }
  }
  kontroly.sort((a, b) => new Date(a.cas) - new Date(b.cas));

  // první kontrola po škodě ji najde
  const incidenty = [];
  const KAT = ['ucpane', 'rozbite', 'pocmarane', 'vytopene', 'znecistene', 'papir'];
  const POPIS = {
    ucpane: 'Ucpaná mísa, ve vodě papírové ručníky.',
    rozbite: 'Utržené držáky na papír a prasklé víko.',
    pocmarane: 'Popsané dveře kabinky fixou.',
    vytopene: 'Voda na podlaze, ucpané umyvadlo.',
    znecistene: 'Znečištěná podlaha a stěna u umyvadla.',
    papir: 'Mokrý papír rozházený po celé místnosti a na stropě.',
  };
  for (const d of damage.sort((a, b) => a.at - b.at)) {
    const k = kontroly.find((x) => x.toaleta === d.toaleta && new Date(x.cas) > d.at && x.stav === 'ok' && !x._used);
    if (!k || new Date(k.cas) > now) continue;
    k.stav = 'skoda'; k._used = true;
    const kat = d.pair ? pick(['papir', 'ucpane', 'rozbite', 'pocmarane']) : pick(KAT);
    const w = computeWindow(kontroly.filter((x) => x !== k), k.toaleta, k.cas);
    const age = (now - new Date(k.cas)) / 86400000;
    incidenty.push({
      id: id('inc'), toaleta: k.toaleta, casNalezu: k.cas, kategorie: kat, popis: POPIS[kat],
      zavaznost: kat === 'rozbite' || kat === 'vytopene' ? 3 : kat === 'papir' ? 1 : 2,
      oknoOd: w.od, siroke: w.siroke, nahlasil: k.kontroloval, jmeno: k.jmeno, role: k.role,
      stav: age > 7 ? 'uzavreno' : age > 2 ? 'resi-se' : 'novy',
      zaver: age > 7 ? 'Opraveno školníkem, žáci nezjištěni.' : '', pocetFotek: 0,
    });
  }
  for (const k of kontroly) delete k._used;
  for (const inc of incidenty) {
    for (const v of visitsInWindow(navstevy, inc.toaleta, inc.oknoOd, inc.casNalezu)) if (!v.incident) v.incident = inc.id;
  }

  // nic z budoucnosti
  const nowT = now.getTime();
  const past = (iso) => new Date(iso).getTime() <= nowT;
  return {
    ref,
    relace: relace.filter((r) => past(r.zacatek)),
    navstevy: navstevy.filter((n) => past(n.casOd)).map((n) => (n.casDo && !past(n.casDo) ? { ...n, casDo: null } : n)),
    kontroly: kontroly.filter((k) => past(k.cas)),
    incidenty: incidenty.filter((i) => past(i.casNalezu)),
  };
}

function removeOverlapping(navstevy, room, day, s, e) {
  const a = atMin(day, s - 1).getTime(), b = atMin(day, e + 1).getTime();
  for (let i = navstevy.length - 1; i >= 0; i--) {
    const n = navstevy[i];
    if (n.ucebna !== room) continue;
    const ns = new Date(n.casOd).getTime(), ne = new Date(n.casDo || n.casOd).getTime();
    if (ns < b && ne > a) navstevy.splice(i, 1);
  }
}
