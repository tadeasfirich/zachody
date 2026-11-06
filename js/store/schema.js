// Datový model: co se ukládá a jak se to jmenuje v SharePointu.
// Každá položka má v SharePointu ve sloupci Title své ID (u událostí náhodné UUID).

import { breaks, slotRange, pad } from '../time.js';

export const KINDS = {
  // číselníky (spravuje správce)
  toalety: { list: 'Toalety', ref: true, fields: [
    ['kod', 'Kod', 'text'], ['nazev', 'Nazev', 'text'], ['patro', 'Patro', 'number'],
    ['typ', 'Typ', 'text'], ['qrToken', 'QrToken', 'text'], ['aktivni', 'Aktivni', 'boolean']] },
  ucebny: { list: 'Ucebny', ref: true, fields: [
    ['nazev', 'Nazev', 'text'], ['patro', 'Patro', 'number'], ['ucet', 'Ucet', 'text'],
    ['maxVenku', 'MaxVenku', 'number'], ['pin', 'Pin', 'text'], ['aktivni', 'Aktivni', 'boolean']] },
  tridy: { list: 'Tridy', ref: true, fields: [
    ['nazev', 'Nazev', 'text'], ['rocnik', 'Rocnik', 'number'], ['aktivni', 'Aktivni', 'boolean']] },
  zaci: { list: 'Zaci', ref: true, fields: [
    ['jmeno', 'Jmeno', 'text'], ['prijmeni', 'Prijmeni', 'text'], ['trida', 'Trida', 'text', true],
    ['typWC', 'TypWC', 'text'], ['aktivni', 'Aktivni', 'boolean'], ['importId', 'ImportId', 'text']] },
  zvoneni: { list: 'Zvoneni', ref: true, fields: [
    ['hodina', 'Hodina', 'number'], ['zacatek', 'Zacatek', 'text'], ['konec', 'Konec', 'text']] },
  planDozoru: { list: 'PlanDozoru', ref: true, fields: [
    ['den', 'DenTydne', 'number'], ['prestavka', 'Prestavka', 'number'], ['patro', 'Patro', 'number'],
    ['ucitel', 'Ucitel', 'text'], ['jmeno', 'Jmeno', 'text']] },
  rozpisKontrol: { list: 'RozpisKontrol', ref: true, fields: [
    ['prestavka', 'Prestavka', 'number'], ['typ', 'TypSlotu', 'text'], ['rezim', 'Rezim', 'text']] },
  // Rozvrh učeben: kdo má v které učebně kterou hodinu. Tablet podle něj sám spustí hodinu.
  // tridy prázdné + volno = podle rozvrhu se neučí; řádek chybí = učitel vybere třídu sám.
  rozvrh: { list: 'Rozvrh', ref: true, fields: [
    ['ucebna', 'Ucebna', 'text', true], ['den', 'DenTydne', 'number'], ['hodina', 'Hodina', 'number'],
    ['tridy', 'Tridy', 'list'], ['volno', 'Volno', 'boolean']] },
  dnyBezProvozu: { list: 'DnyBezProvozu', ref: true, fields: [
    ['datum', 'Datum', 'text'], ['duvod', 'Duvod', 'text']] },
  zvysenyDohled: { list: 'ZvysenyDohled', ref: true, fields: [
    ['patro', 'Patro', 'number'], ['od', 'Od', 'text'], ['do', 'Do', 'text'], ['duvod', 'Duvod', 'text']] },
  nastaveni: { list: 'Nastaveni', ref: true, kv: true, fields: [['hodnota', 'Hodnota', 'text']] },

  // události (zapisují tablety, učitelé, úklid)
  relace: { list: 'Relace', time: 'zacatek', fields: [
    ['ucebna', 'Ucebna', 'text'], ['tridy', 'Tridy', 'list'], ['hodina', 'Hodina', 'text'],
    ['zacatek', 'Zacatek', 'dateTime', true], ['konec', 'Konec', 'dateTime'], ['spustil', 'Spustil', 'text'],
    // puvod: rozvrh (spustil se sám), ucitel (vybral učitel), zmena (učitel opravil rozvrh během hodiny)
    ['puvod', 'Puvod', 'text'], ['rozvrhTridy', 'RozvrhTridy', 'list'], ['zmenil', 'Zmenil', 'text'], ['zmenaCas', 'ZmenaCas', 'dateTime']] },
  navstevy: { list: 'Navstevy', time: 'casOd', fields: [
    ['zak', 'Zak', 'text', true], ['toaleta', 'Toaleta', 'text', true], ['casOd', 'CasOd', 'dateTime', true],
    ['casDo', 'CasDo', 'dateTime'], ['zdroj', 'Zdroj', 'text'], ['ucebna', 'Ucebna', 'text'],
    ['relace', 'Relace', 'text'], ['zapsal', 'Zapsal', 'text'], ['autoUzavreno', 'AutoUzavreno', 'boolean'],
    ['incident', 'Incident', 'text']] },
  kontroly: { list: 'Kontroly', time: 'cas', fields: [
    ['toaleta', 'Toaleta', 'text', true], ['cas', 'Cas', 'dateTime', true], ['stav', 'Stav', 'text'],
    ['kontroloval', 'Kontroloval', 'text'], ['jmeno', 'Jmeno', 'text'], ['role', 'Role', 'text'],
    ['slot', 'Slot', 'text'], ['poznamka', 'Poznamka', 'note']] },
  incidenty: { list: 'Incidenty', time: 'casNalezu', fields: [
    ['toaleta', 'Toaleta', 'text', true], ['casNalezu', 'CasNalezu', 'dateTime', true], ['kategorie', 'Kategorie', 'text'],
    ['popis', 'Popis', 'note'], ['zavaznost', 'Zavaznost', 'number'], ['oknoOd', 'OknoOd', 'dateTime'],
    ['siroke', 'Siroke', 'boolean'], ['nahlasil', 'Nahlasil', 'text'], ['jmeno', 'Jmeno', 'text'],
    ['role', 'Role', 'text'], ['stav', 'Stav', 'text'], ['zaver', 'Zaver', 'note'], ['pocetFotek', 'PocetFotek', 'number']] },

  // šablona slotů pro Power Automate (přepočítá se při uložení zvonění / plánu / rozpisu)
  slotyKontrol: { list: 'SlotyKontrol', ref: true, derived: true, fields: [
    ['den', 'DenTydne', 'number', true], ['prestavka', 'Prestavka', 'number'], ['typ', 'TypSlotu', 'text'],
    ['toaleta', 'Toaleta', 'text'], ['patro', 'Patro', 'number'], ['casOd', 'CasOd', 'text'], ['casDo', 'CasDo', 'text'],
    ['minOd', 'MinOd', 'number'], ['minDo', 'MinDo', 'number', true],
    ['povinne', 'Povinne', 'boolean'], ['ucitel', 'Ucitel', 'text'], ['jmeno', 'Jmeno', 'text']] },
};

export const EVENT_KINDS = ['relace', 'navstevy', 'kontroly', 'incidenty'];
export const REF_KINDS = Object.keys(KINDS).filter((k) => KINDS[k].ref && !KINDS[k].derived);

export const KATEGORIE = {
  ucpane: 'Ucpané',
  rozbite: 'Rozbité',
  pocmarane: 'Počmárané',
  vytopene: 'Vytopené',
  znecistene: 'Znečištěné',
  papir: 'Rozházený papír',
  jine: 'Jiné',
};

export const ZAVAZNOST = { 1: 'Drobná', 2: 'Střední', 3: 'Vážná' };
export const STAV_INCIDENTU = { novy: 'Nový', 'resi-se': 'Řeší se', uzavreno: 'Uzavřeno' };
export const PATRA = { 0: 'Přízemí', 1: '1. patro', 2: '2. patro' };
export const TYP_WC = { CH: 'chlapci', D: 'dívky' };

export function defaultRef() {
  const toalety = [];
  for (const p of [0, 1, 2]) for (const t of ['CH', 'D']) {
    const kod = `${p === 0 ? 'P' : p}-${t}`;
    toalety.push({ id: kod, kod, nazev: `${PATRA[p]} – ${TYP_WC[t]}`, patro: p, typ: t, qrToken: randomToken(), aktivni: true });
  }
  const zvoneni = [
    ['1', '8:00', '8:45'], ['2', '8:55', '9:40'], ['3', '10:00', '10:45'], ['4', '10:55', '11:40'],
    ['5', '11:50', '12:35'], ['6', '12:45', '13:30'], ['7', '13:40', '14:25'],
  ].map(([hodina, zacatek, konec]) => ({ id: `h${hodina}`, hodina: Number(hodina), zacatek, konec }));
  const rozpisKontrol = [];
  for (let p = 1; p <= 6; p++) {
    rozpisKontrol.push({ id: `r${p}-kp`, prestavka: p, typ: 'konec-prestavky', rezim: 'povinne' });
    rozpisKontrol.push({ id: `r${p}-kh`, prestavka: p, typ: 'konec-hodiny', rezim: 'nepovinne' });
  }
  return {
    toalety, zvoneni, rozpisKontrol,
    ucebny: [], tridy: [], zaci: [], planDozoru: [], dnyBezProvozu: [], zvysenyDohled: [], rozvrh: [],
    nastaveni: defaultSettings(),
  };
}

export function defaultSettings() {
  return {
    nazevSkoly: 'ZŠ Karla Hašlera Libčice',
    retenceDni: 30,
    autoUzavreniMin: 10,
    toleranceMin: 5,
    jmenaVidiUklid: false,
    jmenaVidiUcitel: true,
    // Fáze 1 (jen tablety): upozornění na vynechané kontroly a nové škody se neposílají.
    upozorneni: false,
  };
}

export function randomToken() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

// Šablona slotů pro Power Automate: den × přestávka × toaleta, časy jako „HH:MM“.
export function buildSlotTemplate(ref) {
  // Upozornění vypnutá = žádné sloty, Power Automate nemá co hlídat.
  if (!ref.nastaveni || !ref.nastaveni.upozorneni) return [];
  const tol = Number(ref.nastaveni.toleranceMin ?? 5);
  const out = [];
  const br = breaks(ref.zvoneni);
  const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  for (let den = 1; den <= 5; den++) {
    for (const r of ref.rozpisKontrol.filter((x) => x.rezim === 'povinne')) {
      const b = br.find((x) => x.po === Number(r.prestavka));
      if (!b) continue;
      const [a, z] = slotRange(b, r.typ, tol);
      for (const t of ref.toalety.filter((x) => x.aktivni !== false)) {
        const d = ref.planDozoru.find((p) => Number(p.den) === den && Number(p.prestavka) === b.po && Number(p.patro) === Number(t.patro));
        out.push({
          id: `${den}-${b.po}-${r.typ}-${t.id}`, den, prestavka: b.po, typ: r.typ, toaleta: t.id, patro: Number(t.patro),
          casOd: hhmm(a), casDo: hhmm(z), minOd: a, minDo: z, povinne: true, ucitel: d ? d.ucitel : '', jmeno: d ? d.jmeno : '',
        });
      }
    }
  }
  return out;
}

// Položka rozvrhu pro učebnu, den (1 = po) a hodinu. null = nevyplněno.
export function rozvrhFor(ref, ucebna, den, hodina) {
  return (ref.rozvrh || []).find((r) => r.ucebna === ucebna && Number(r.den) === Number(den) && Number(r.hodina) === Number(hodina)) || null;
}

export function rozvrhLabel(e) {
  if (!e) return '';
  if (e.volno) return 'volno';
  return (e.tridy || []).join(' + ');
}
