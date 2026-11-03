// Správa – žáci a import, číselníky a pravidla, QR štítky, data a uchování, instalace SharePointu.

import { h, mount, mark, modal, toast, fmt, uid, normalize, confirmDialog, downloadText, toCsv, studentName } from '../ui.js';
import { CONFIG, appUrl } from '../config.js';
import { PATRA, TYP_WC, KATEGORIE, randomToken, defaultSettings } from '../store/schema.js';
import { breaks, hmStr, startOfDay, addDays, dateKey } from '../time.js';
import { incidentVisitors } from '../logic.js';
import { loadRange } from '../data.js';

export async function render(el, ctx, page, r) {
  if (page === 'zaci') return zaci(el, ctx, r);
  if (page === 'nastaveni') return nastaveni(el, ctx, r);
  if (page === 'qr') return qr(el, ctx);
  if (page === 'data') return dataPage(el, ctx);
  if (page === 'instalace') return instalace(el, ctx);
}

const H = (eyebrow, title, sub) => [
  h('div', { class: 'eyebrow' }, eyebrow), h('h1', { class: 'title' }, title),
  sub ? h('p', { class: 'sub' }, sub) : null, h('hr', { class: 'rule' }),
];

async function save(ctx, kind, value, msg = 'Uloženo.') {
  try {
    await ctx.store.saveRef(kind, value);
    await ctx.reloadRef();
    toast(msg);
    return true;
  } catch (e) {
    console.error(e);
    toast(`Uložení se nepovedlo: ${e.message}`, { timeout: 7000 });
    return false;
  }
}

// ---------- obecná upravitelná tabulka ----------
function editTable({ columns, rows, newRow, onSave, note }) {
  let data = rows.map((r) => ({ ...r }));
  const wrap = h('div');
  const draw = () => {
    mount(wrap,
      h('div', { class: 'table-wrap' }, h('table', { class: 'edit' },
        h('thead', null, h('tr', null, columns.map((c) => h('th', null, c.label)), h('th', null, ''))),
        h('tbody', null, data.map((row, i) => h('tr', null,
          columns.map((c) => h('td', { style: c.width ? { width: c.width } : null }, cell(c, row))),
          h('td', null, h('button', { class: 'btn small ghost', 'aria-label': 'Smazat řádek', onclick: () => { data.splice(i, 1); draw(); } }, 'Smazat'))))))),
      note ? h('p', { class: 'muted small' }, note) : null,
      h('div', { class: 'btn-row', style: { marginTop: '12px' } },
        newRow ? h('button', { class: 'btn', onclick: () => { data.push(newRow()); draw(); } }, 'Přidat řádek') : null,
        h('button', { class: 'btn primary', onclick: () => onSave(data) }, 'Uložit')));
  };
  const cell = (c, row) => {
    const v = row[c.key];
    if (c.readonly) return h('span', { class: 'num muted' }, String(v ?? ''));
    if (c.type === 'checkbox') return h('input', { type: 'checkbox', checked: v !== false || null, onchange: (e) => { row[c.key] = e.target.checked; } });
    if (c.type === 'select') return h('select', { onchange: (e) => { row[c.key] = c.number ? Number(e.target.value) : e.target.value; } },
      c.options.map(([ov, ol]) => h('option', { value: ov, selected: String(ov) === String(v) || null }, ol)));
    return h('input', { type: c.type || 'text', value: v ?? '', placeholder: c.placeholder || '', oninput: (e) => { row[c.key] = c.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value; } });
  };
  draw();
  return wrap;
}

const patroOpts = [[0, PATRA[0]], [1, PATRA[1]], [2, PATRA[2]]];

// ================= ŽÁCI A IMPORT =================
async function zaci(el, ctx, r) {
  const ref = ctx.ref;
  let tr = r.query.get('t') || (ref.tridy[0] && ref.tridy[0].nazev) || '';
  const draw = () => {
    const list = ref.zaci.filter((z) => z.trida === tr).sort((a, b) => a.prijmeni.localeCompare(b.prijmeni, 'cs'));
    const others = ref.zaci.filter((z) => z.trida !== tr);
    mount(el,
      ...H('Správa', 'Žáci a import', 'Seznamy žáků po třídách. Na začátku roku je nahraješ z exportu ze Školy OnLine, během roku tu opravíš jednotlivce.'),
      h('div', { class: 'grid c2' },
        h('div', { class: 'box fill' }, h('h4', null, 'Import z Excelu nebo CSV'),
          h('p', null, 'Ve Škole OnLine vyexportuj seznam žáků se sloupci jméno, příjmení, třída a pohlaví. Aplikace ukáže, co se změní, a teprve pak to uloží.'),
          h('button', { class: 'btn primary', onclick: () => importDialog(ctx) }, 'Nahrát soubor')),
        h('div', { class: 'box' }, h('h4', null, 'Souhrn'),
          h('p', { style: { margin: 0 } }, `${ref.zaci.filter((z) => z.aktivni !== false).length} aktivních žáků v ${ref.tridy.length} třídách.`),
          ref.zaci.some((z) => !z.typWC) ? h('p', { class: 'note-strip' }, 'Někteří žáci nemají vyplněný typ toalety.') : null)),
      h('hr', { class: 'rule-thin' }),
      h('div', { class: 'filters' }, h('label', { class: 'field' }, h('span', null, 'Třída'),
        h('select', { onchange: (e) => { tr = e.target.value; draw(); } }, ref.tridy.map((t) => h('option', { value: t.nazev, selected: t.nazev === tr || null }, t.nazev))))),
      editTable({
        columns: [
          { key: 'prijmeni', label: 'Příjmení' }, { key: 'jmeno', label: 'Jméno' },
          { key: 'trida', label: 'Třída', type: 'select', options: ref.tridy.map((t) => [t.nazev, t.nazev]), width: '90px' },
          { key: 'typWC', label: 'Toaleta', type: 'select', options: [['', '–'], ['CH', 'chlapci'], ['D', 'dívky']], width: '110px' },
          { key: 'aktivni', label: 'Aktivní', type: 'checkbox', width: '70px' },
        ],
        rows: list,
        newRow: () => ({ id: uid(), jmeno: '', prijmeni: '', trida: tr, typWC: '', aktivni: true, importId: '' }),
        note: 'Žáka, který odešel, neodstraňuj – zruš „Aktivní“. Jeho záznamy u starých incidentů tak zůstanou čitelné.',
        onSave: async (rows) => { if (await save(ctx, 'zaci', [...others, ...rows.filter((z) => z.prijmeni || z.jmeno)])) draw(); },
      }));
  };
  draw();
}

async function importDialog(ctx) {
  const ref = ctx.ref;
  modal((close) => {
    const body = h('div');
    const input = h('input', { type: 'file', accept: '.xlsx,.xls,.csv,.txt' });
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      mount(body, h('p', { class: 'muted' }, 'Čtu soubor…'));
      try { showMapping(await readTable(f)); } catch (e) { mount(body, h('p', null, `Soubor se nepodařilo přečíst: ${e.message}`)); }
    });

    function showMapping(rows) {
      if (!rows.length) { mount(body, h('p', null, 'Soubor je prázdný.')); return; }
      const headers = rows[0].map((x) => String(x || '').trim());
      const guess = (re) => headers.findIndex((x) => re.test(normalize(x)));
      const map = {
        jmeno: guess(/^jmeno|krestni/), prijmeni: guess(/prijmeni/), trida: guess(/^trida|^tr\.?$|class/),
        pohlavi: guess(/pohlavi|^sex|gender|^wc|toaleta/), importId: guess(/^id|evid|cislo|kod/),
      };
      const labels = { jmeno: 'Jméno', prijmeni: 'Příjmení', trida: 'Třída', pohlavi: 'Pohlaví / toaleta', importId: 'ID žáka (nepovinné)' };
      const sel = (k) => h('select', { onchange: (e) => { map[k] = Number(e.target.value); } },
        h('option', { value: -1 }, '– nepoužít –'), headers.map((x, i) => h('option', { value: i, selected: i === map[k] || null }, x || `sloupec ${i + 1}`)));
      mount(body,
        h('p', null, `Načteno ${rows.length - 1} řádků. Zkontroluj, který sloupec je který:`),
        h('div', { class: 'grid c2' }, Object.keys(labels).map((k) => h('label', { class: 'field' }, h('span', null, labels[k]), sel(k)))),
        h('div', { class: 'btn-row', style: { marginTop: '14px' } }, h('button', { class: 'btn primary', onclick: () => preview(rows.slice(1), map) }, 'Ukázat změny')));
    }

    function preview(rows, map) {
      if (map.jmeno < 0 || map.prijmeni < 0 || map.trida < 0) { toast('Vyber aspoň jméno, příjmení a třídu.'); return; }
      const toWc = (v) => {
        const s = normalize(v);
        if (!s) return '';
        if (/^(m|ch|chl|muz|kluk|h|b)/.test(s)) return 'CH';
        if (/^(z|d|div|f|g)/.test(s)) return 'D';
        return '';
      };
      const normClass = (v) => String(v || '').replace(/\s+/g, '').toUpperCase().replace(/^(\d)\.?([A-Z])$/, '$1.$2');
      const incoming = rows.filter((r) => r[map.jmeno] || r[map.prijmeni]).map((r) => ({
        jmeno: String(r[map.jmeno] || '').trim(), prijmeni: String(r[map.prijmeni] || '').trim(),
        trida: normClass(r[map.trida]), typWC: map.pohlavi >= 0 ? toWc(r[map.pohlavi]) : '',
        importId: map.importId >= 0 ? String(r[map.importId] || '').trim() : '',
      }));
      const key = (z) => (z.importId ? `id:${z.importId}` : `n:${normalize(z.prijmeni)}|${normalize(z.jmeno)}`);
      const existing = new Map();
      for (const z of ref.zaci) { existing.set(key(z), z); if (z.importId) existing.set(`n:${normalize(z.prijmeni)}|${normalize(z.jmeno)}`, z); }
      const seen = new Set();
      const added = [], moved = [], same = [];
      const result = ref.zaci.map((z) => ({ ...z }));
      const byId = new Map(result.map((z) => [z.id, z]));
      for (const n of incoming) {
        const ex = existing.get(key(n)) || existing.get(`n:${normalize(n.prijmeni)}|${normalize(n.jmeno)}`);
        if (ex) {
          seen.add(ex.id);
          const z = byId.get(ex.id);
          if (z.trida !== n.trida) moved.push({ z, to: n.trida });
          else same.push(z);
          z.trida = n.trida; z.aktivni = true;
          if (n.typWC) z.typWC = n.typWC;
          if (n.importId) z.importId = n.importId;
        } else {
          const z = { id: uid(), ...n, aktivni: true };
          added.push(z); result.push(z);
        }
      }
      const gone = result.filter((z) => z.aktivni !== false && !seen.has(z.id) && !added.includes(z));
      for (const z of gone) z.aktivni = false;
      const newClasses = [...new Set(incoming.map((z) => z.trida))].filter((t) => t && !ref.tridy.some((x) => x.nazev === t));
      const noWc = result.filter((z) => z.aktivni !== false && !z.typWC).length;

      mount(body,
        h('div', { class: 'kpis' },
          h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(added.length)), h('div', { class: 'l' }, 'noví žáci')),
          h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(moved.length)), h('div', { class: 'l' }, 'přeřazení')),
          h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(gone.length)), h('div', { class: 'l' }, 'odešlí (deaktivují se)')),
          h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(same.length)), h('div', { class: 'l' }, 'beze změny'))),
        newClasses.length ? h('p', { class: 'note-strip', style: { marginTop: '12px' } }, `Nové třídy: ${newClasses.join(', ')} – založím je.`) : null,
        noWc ? h('p', { class: 'note-strip' }, `${noWc} žáků nemá typ toalety. Doplň ho po importu ve třídě.`) : null,
        moved.length ? h('details', null, h('summary', null, 'Přeřazení'), h('ul', null, moved.slice(0, 50).map((m) => h('li', null, `${studentName(m.z)}: → ${m.to}`)))) : null,
        gone.length ? h('details', null, h('summary', null, 'Odešlí'), h('ul', null, gone.slice(0, 80).map((z) => h('li', null, `${studentName(z)} (${z.trida})`)))) : null,
        h('div', { class: 'btn-row', style: { marginTop: '16px' } },
          h('button', { class: 'btn primary', onclick: async () => {
            if (newClasses.length) {
              const tridy = [...ref.tridy, ...newClasses.map((t) => ({ id: t, nazev: t, rocnik: Number(t.split('.')[0]) || 0, aktivni: true }))];
              await ctx.store.saveRef('tridy', tridy);
            }
            if (await save(ctx, 'zaci', result, 'Import hotový.')) { close(); ctx.navigate('#/sprava/zaci'); }
          } }, 'Provést import'),
          h('button', { class: 'btn ghost', onclick: close }, 'Zrušit')));
    }

    return [
      h('div', { class: 'eyebrow' }, 'Import žáků'),
      h('h2', { class: 'title' }, 'Nahraj export ze Školy OnLine'),
      h('p', { class: 'muted' }, 'Excel (.xlsx) nebo CSV. První řádek musí obsahovat názvy sloupců.'),
      h('hr', { class: 'rule' }),
      input, h('div', { style: { marginTop: '14px' } }, body),
    ];
  }, { wide: true });
}

async function readTable(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    let text = await file.text();
    if (text.includes('�')) text = new TextDecoder('windows-1250').decode(await file.arrayBuffer());
    return parseCsv(text.replace(/^﻿/, ''));
  }
  const XLSX = await import(CONFIG.cdn.xlsx);
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sh = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
}

function parseCsv(text) {
  const first = text.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}

// ================= ČÍSELNÍKY A PRAVIDLA =================
const SECTIONS = [
  ['dozory', 'Plán dozorů'], ['rozpis', 'Rozpis kontrol'], ['zvoneni', 'Zvonění'], ['dny', 'Dny bez provozu'],
  ['dohled', 'Zvýšený dohled'], ['ucebny', 'Učebny a tablety'], ['tridy', 'Třídy'], ['toalety', 'Toalety'], ['obecne', 'Obecné'],
];

async function nastaveni(el, ctx, r) {
  const sec = r.params[1] || 'dozory';
  const ref = ctx.ref;
  const tabs = h('nav', { class: 'subnav' }, SECTIONS.map(([k, l]) => h('a', { href: `#/sprava/nastaveni/${k}`, 'aria-current': k === sec ? 'page' : null }, l)));
  const body = h('div');
  mount(el, ...H('Správa', 'Číselníky a pravidla'), tabs, body);
  const reload = () => ctx.navigate(`#/sprava/nastaveni/${sec}`);

  if (sec === 'toalety') {
    mount(body, editTable({
      columns: [
        { key: 'id', label: 'Kód', width: '90px' }, { key: 'nazev', label: 'Název' },
        { key: 'patro', label: 'Patro', type: 'select', options: patroOpts, number: true },
        { key: 'typ', label: 'Typ', type: 'select', options: [['CH', 'chlapci'], ['D', 'dívky']] },
        { key: 'aktivni', label: 'Aktivní', type: 'checkbox' },
      ],
      rows: ref.toalety,
      newRow: () => ({ id: '', kod: '', nazev: '', patro: 0, typ: 'CH', qrToken: randomToken(), aktivni: true }),
      note: 'Kód se tiskne do QR štítku. Když ho změníš, vytiskni štítky znovu.',
      onSave: async (rows) => { await save(ctx, 'toalety', rows.filter((x) => x.id).map((x) => ({ ...x, kod: x.id }))); reload(); },
    }));
  }
  if (sec === 'ucebny') {
    mount(body, editTable({
      columns: [
        { key: 'nazev', label: 'Učebna' }, { key: 'patro', label: 'Patro', type: 'select', options: patroOpts, number: true, width: '120px' },
        { key: 'ucet', label: 'Účet tabletu (e-mail)', type: 'email' }, { key: 'maxVenku', label: 'Venku max.', type: 'number', width: '90px' },
        { key: 'pin', label: 'PIN (nepovinný)', width: '110px' }, { key: 'aktivni', label: 'Aktivní', type: 'checkbox', width: '70px' },
      ],
      rows: ref.ucebny,
      newRow: () => ({ id: `u-${uid().slice(0, 8)}`, nazev: '', patro: 0, ucet: '', maxVenku: 1, pin: '', aktivni: true }),
      note: 'Účet tabletu = e-mail, kterým je tablet přihlášený. Účet musí být i ve skupině učeben (viz SETUP.md). PIN chrání nastavení tabletu před žáky.',
      onSave: async (rows) => { await save(ctx, 'ucebny', rows.map((x) => ({ ...x, ucet: String(x.ucet || '').toLowerCase().trim() }))); reload(); },
    }));
  }
  if (sec === 'tridy') {
    mount(body, editTable({
      columns: [{ key: 'nazev', label: 'Třída' }, { key: 'rocnik', label: 'Ročník', type: 'number' }, { key: 'aktivni', label: 'Aktivní', type: 'checkbox' }],
      rows: ref.tridy,
      newRow: () => ({ id: '', nazev: '', rocnik: 1, aktivni: true }),
      onSave: async (rows) => { await save(ctx, 'tridy', rows.filter((x) => x.nazev).map((x) => ({ ...x, id: x.nazev }))); reload(); },
    }));
  }
  if (sec === 'zvoneni') {
    mount(body, editTable({
      columns: [{ key: 'hodina', label: 'Hodina', type: 'number', width: '90px' }, { key: 'zacatek', label: 'Začátek', placeholder: '8:00' }, { key: 'konec', label: 'Konec', placeholder: '8:45' }],
      rows: ref.zvoneni,
      newRow: () => ({ id: `h${uid().slice(0, 6)}`, hodina: ref.zvoneni.length + 1, zacatek: '', konec: '' }),
      note: 'Časy piš jako 8:00. Přestávky se dopočítají samy. Po uložení se přepočítají i sloty kontrol pro upozornění.',
      onSave: async (rows) => {
        const bad = rows.find((x) => !/^\d{1,2}:\d{2}$/.test(x.zacatek) || !/^\d{1,2}:\d{2}$/.test(x.konec));
        if (bad) { toast('Časy musí být ve tvaru 8:00.'); return; }
        await save(ctx, 'zvoneni', rows.map((x) => ({ ...x, id: x.id || `h${x.hodina}` }))); reload();
      },
    }));
  }
  if (sec === 'dny') {
    mount(body, editTable({
      columns: [{ key: 'datum', label: 'Datum', type: 'date', width: '180px' }, { key: 'duvod', label: 'Důvod' }],
      rows: [...ref.dnyBezProvozu].sort((a, b) => a.datum.localeCompare(b.datum)),
      newRow: () => ({ id: uid().slice(0, 8), datum: dateKey(new Date()), duvod: '' }),
      note: 'Prázdniny, svátky, ředitelské volno, výlety celé školy. V tyto dny se kontroly nevyžadují.',
      onSave: async (rows) => { await save(ctx, 'dnyBezProvozu', rows.filter((x) => x.datum)); reload(); },
    }));
  }
  if (sec === 'dohled') {
    mount(body, editTable({
      columns: [{ key: 'patro', label: 'Patro', type: 'select', options: patroOpts, number: true, width: '120px' },
        { key: 'od', label: 'Od', type: 'date', width: '170px' }, { key: 'do', label: 'Do', type: 'date', width: '170px' }, { key: 'duvod', label: 'Důvod' }],
      rows: ref.zvysenyDohled,
      newRow: () => ({ id: uid().slice(0, 8), patro: 2, od: dateKey(new Date()), do: dateKey(addDays(new Date(), 4)), duvod: '' }),
      note: 'Když běží zvýšený dohled, dozor na patře o přestávkách stojí u dveří a zapisuje vstupy v aplikaci (Dozor a kontrola → U dveří).',
      onSave: async (rows) => { await save(ctx, 'zvysenyDohled', rows); reload(); },
    }));
  }
  if (sec === 'rozpis') {
    const br = breaks(ref.zvoneni);
    const state = new Map(ref.rozpisKontrol.map((x) => [`${x.prestavka}|${x.typ}`, x.rezim]));
    const opt = (k) => h('select', { onchange: (e) => state.set(k, e.target.value) },
      [['povinne', 'povinná'], ['nepovinne', 'nepovinná'], ['ne', 'žádná']].map(([v, l]) => h('option', { value: v, selected: (state.get(k) || 'ne') === v || null }, l)));
    mount(body,
      h('p', { class: 'sub' }, 'Kdy se má kontrolovat. Povinné kontroly se počítají do plnění a hlídá je upozornění pro vedení.'),
      h('table', { class: 'edit' },
        h('thead', null, h('tr', null, h('th', null, 'Přestávka'), h('th', null, 'Na začátku přestávky'), h('th', null, 'Na konci přestávky'))),
        h('tbody', null, br.map((b) => h('tr', null,
          h('td', null, `${b.po}. (${hmStr(b.od)}–${hmStr(b.do)})`), h('td', null, opt(`${b.po}|konec-hodiny`)), h('td', null, opt(`${b.po}|konec-prestavky`)))))),
      h('p', { class: 'muted small' }, `Okno kontroly: začátek přestávky = 5 min před zvoněním až 3 min po něm; konec přestávky = 3 min před zvoněním až 5 min po něm. K tomu tolerance ${ref.nastaveni.toleranceMin} min (Obecné).`),
      h('button', { class: 'btn primary', onclick: async () => {
        const rows = [];
        for (const [k, v] of state) { if (v === 'ne') continue; const [p, typ] = k.split('|'); rows.push({ id: `r${p}-${typ === 'konec-hodiny' ? 'kh' : 'kp'}`, prestavka: Number(p), typ, rezim: v }); }
        await save(ctx, 'rozpisKontrol', rows); reload();
      } }, 'Uložit'));
  }
  if (sec === 'dozory') drawPlan(body, ctx, reload);
  if (sec === 'obecne') {
    const s = { ...defaultSettings(), ...ref.nastaveni };
    const f = (k, label, type = 'text', help) => h('label', { class: type === 'checkbox' ? 'check' : 'field' },
      type === 'checkbox'
        ? [h('input', { type: 'checkbox', checked: !!s[k] || null, onchange: (e) => { s[k] = e.target.checked; } }), label]
        : [h('span', null, label), h('input', { type, value: s[k] ?? '', oninput: (e) => { s[k] = type === 'number' ? Number(e.target.value) : e.target.value; } })],
      help ? h('span', { class: 'muted small' }, help) : null);
    mount(body, h('div', { class: 'stack', style: { maxWidth: '560px' } },
      f('nazevSkoly', 'Název školy'),
      f('autoUzavreniMin', 'Po kolika minutách se nezapsaný návrat uzavře sám', 'number'),
      f('toleranceMin', 'Tolerance kontroly (minuty navíc za oknem)', 'number'),
      f('retenceDni', 'Uchovávat odchody žáků (dní)', 'number', 'Odchody, které nepatří k žádnému incidentu, se po této době mažou.'),
      f('jmenaVidiUcitel', 'Učitel, který škodu nahlásil, vidí jména žáků v okně', 'checkbox'),
      f('jmenaVidiUklid', 'Uklízečka vidí jména žáků v okně (jinak jen počet)', 'checkbox'),
      h('button', { class: 'btn primary', onclick: async () => { await save(ctx, 'nastaveni', s); reload(); } }, 'Uložit')));
  }
}

function drawPlan(body, ctx, reload) {
  const ref = ctx.ref;
  const br = breaks(ref.zvoneni);
  const people = new Map();
  for (const p of ref.planDozoru) if (p.ucitel) people.set(p.ucitel.toLowerCase(), p.jmeno || p.ucitel);
  for (const u of (ref.nastaveni.ucitele || [])) people.set(u.email.toLowerCase(), u.jmeno);
  const plan = new Map(ref.planDozoru.map((p) => [`${p.den}|${p.prestavka}|${p.patro}`, p.ucitel ? p.ucitel.toLowerCase() : '']));
  const DNY = ['', 'Po', 'Út', 'St', 'Čt', 'Pá'];

  const draw = () => {
    const opts = [['', '–'], ...[...people.entries()].sort((a, b) => a[1].localeCompare(b[1], 'cs'))];
    const sel = (k) => h('select', { style: { minWidth: '118px' }, onchange: (e) => plan.set(k, e.target.value) },
      opts.map(([v, l]) => h('option', { value: v, selected: (plan.get(k) || '') === v || null }, l)));
    const name = h('input', { type: 'text', placeholder: 'Jméno a příjmení' });
    const mail = h('input', { type: 'email', placeholder: 'e-mail @skola.libcice.cz' });
    mount(body,
      h('p', { class: 'sub' }, 'Kdo má o které přestávce dozor na kterém patře. Podle toho aplikace ví, kdo měl kontrolu udělat, a komu poslat upozornění.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'edit' },
        h('thead', null, h('tr', null, h('th', null, 'Přestávka'), h('th', null, 'Patro'), [1, 2, 3, 4, 5].map((d) => h('th', null, DNY[d])))),
        h('tbody', null, br.flatMap((b) => [0, 1, 2].map((p) => h('tr', null,
          h('td', { class: 'nowrap' }, p === 0 ? `${b.po}. (${hmStr(b.od)})` : ''),
          h('td', { class: 'nowrap muted' }, PATRA[p]),
          [1, 2, 3, 4, 5].map((d) => h('td', null, sel(`${d}|${b.po}|${p}`))))))))),
      h('div', { class: 'btn-row', style: { marginTop: '12px' } },
        h('button', { class: 'btn primary', onclick: async () => {
          const rows = [];
          for (const [k, v] of plan) {
            if (!v) continue;
            const [den, prestavka, patro] = k.split('|').map(Number);
            rows.push({ id: `d${den}-${prestavka}-${patro}`, den, prestavka, patro, ucitel: v, jmeno: people.get(v) || v });
          }
          await save(ctx, 'planDozoru', rows); reload();
        } }, 'Uložit plán')),
      h('hr', { class: 'rule-thin' }),
      h('div', { class: 'box fill' }, h('h4', null, 'Přidat učitele do nabídky'),
        h('div', { class: 'grid c2' }, name, mail),
        h('button', { class: 'btn', style: { marginTop: '10px' }, onclick: async () => {
          const e = mail.value.trim().toLowerCase();
          if (!name.value.trim() || !e.includes('@')) { toast('Vyplň jméno i e-mail.'); return; }
          people.set(e, name.value.trim());
          const ucitele = [...(ref.nastaveni.ucitele || []).filter((u) => u.email.toLowerCase() !== e), { jmeno: name.value.trim(), email: e }];
          await save(ctx, 'nastaveni', { ...ref.nastaveni, ucitele }, 'Učitel přidán.');
          draw();
        } }, 'Přidat')));
  };
  draw();
}

// ================= QR ŠTÍTKY =================
async function qr(el, ctx) {
  const ref = ctx.ref;
  const sheet = h('div', { class: 'qr-sheet' });
  mount(el,
    h('div', { class: 'no-print' },
      ...H('Správa', 'QR štítky na dveře', 'Vytiskni A4, rozstříhej podle čárkované linky a nalep na dveře toalet (ideálně do průhledného obalu). Dozor naskenuje kód fotoaparátem telefonu a je rovnou v kontrole.'),
      h('div', { class: 'btn-row', style: { marginBottom: '16px' } },
        h('button', { class: 'btn primary', onclick: () => window.print() }, 'Tisknout'),
        ctx.isAdmin() ? h('button', { class: 'btn ghost', onclick: async () => {
          if (!(await confirmDialog('Vygenerovat nové kódy? Staré štítky budou dál fungovat, ale aplikace upozorní, že jsou zastaralé.', { ok: 'Vygenerovat' }))) return;
          await save(ctx, 'toalety', ref.toalety.map((t) => ({ ...t, qrToken: randomToken() })), 'Nové kódy připravené.');
          ctx.navigate('#/sprava/qr');
        } }, 'Vygenerovat nové kódy') : null),
      ctx.demo ? h('p', { class: 'note-strip', style: { marginBottom: '14px' } }, 'V demo režimu vedou kódy na adresu, kde aplikace právě běží.') : null),
    sheet);

  let qrlib = null;
  try { qrlib = (await import(CONFIG.cdn.qrcode)).default; } catch (e) { console.warn('QR knihovna se nenačetla', e); }
  mount(sheet, ref.toalety.filter((t) => t.aktivni !== false).map((t) => {
    const url = `${appUrl()}#/kontrola/${encodeURIComponent(t.id)}?t=${t.qrToken || ''}`;
    let code;
    if (qrlib) {
      const q = qrlib(0, 'M'); q.addData(url); q.make();
      code = h('div', { html: q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) });
    } else code = h('div', { class: 'box dashed', style: { width: '42mm', height: '42mm', fontSize: '8pt' } }, 'QR kód se nenačetl (chybí internet).');
    return h('div', { class: 'qr-card' },
      h('div', { class: 'eyebrow' }, 'Záchody – kontrola stavu'),
      h('div', { class: 'name' }, t.nazev),
      h('div', { class: 'qr' }, code,
        h('div', { class: 'txt' },
          h('p', null, 'Naskenuj a potvrď stav. Dvě ťuknutí.'),
          h('p', { style: { margin: 0 } }, h('b', null, 'V pořádku'), ' nebo ', h('b', null, 'Škoda'), ' s fotkou.'))),
      h('div', { class: 'code' }, url));
  }));
}

// ================= DATA A UCHOVÁNÍ =================
async function dataPage(el, ctx) {
  const ref = ctx.ref;
  const now = new Date();
  const days = Number(ref.nastaveni.retenceDni || 30);
  const limit = startOfDay(addDays(now, -days));
  const all = await loadRange(ctx, { from: addDays(now, -400), to: now, kinds: ['navstevy', 'incidenty', 'relace', 'kontroly'] });
  const linked = new Set(all.navstevy.filter((n) => n.incident).map((n) => n.id));
  for (const i of all.incidenty) for (const v of all.navstevy) {
    if (v.toaleta !== i.toaleta) continue;
    const s = new Date(v.casOd).getTime();
    if (s >= new Date(i.oknoOd).getTime() - 600000 && s <= new Date(i.casNalezu).getTime()) linked.add(v.id);
  }
  const oldNav = all.navstevy.filter((n) => new Date(n.casOd) < limit && !linked.has(n.id));
  const oldRel = all.relace.filter((r) => new Date(r.zacatek) < limit);
  const zMap = new Map(ref.zaci.map((z) => [z.id, z]));
  const stamp = dateKey(now);

  mount(el,
    ...H('Správa', 'Data a uchování', `Odchody žáků se uchovávají ${days} dní. Odchody, které patří do okna některého incidentu, zůstávají, dokud incident existuje.`),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(all.navstevy.length)), h('div', { class: 'l' }, 'uložených odchodů')),
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(oldNav.length)), h('div', { class: 'l' }, `starších než ${days} dní (ke smazání)`)),
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(linked.size)), h('div', { class: 'l' }, 'navázaných na incidenty'))),
    h('div', { class: 'btn-row', style: { margin: '16px 0' } },
      h('button', { class: 'btn primary', disabled: !(oldNav.length || oldRel.length) || null, onclick: async () => {
        if (!(await confirmDialog(`Smazat ${oldNav.length} odchodů a ${oldRel.length} záznamů hodin starších než ${days} dní?`, { ok: 'Smazat' }))) return;
        await ctx.store.removeMany('navstevy', oldNav.map((x) => x.id));
        await ctx.store.removeMany('relace', oldRel.map((x) => x.id));
        toast('Smazáno.'); ctx.navigate('#/sprava/data');
      } }, 'Smazat starší záznamy teď')),
    h('p', { class: 'muted small' }, ctx.demo ? 'V ostrém provozu to každou noc dělá Power Automate (SETUP.md, tok 3).' : 'Automaticky to každou noc dělá Power Automate (SETUP.md, tok 3). Tohle tlačítko je pro ruční úklid.'),
    h('hr', { class: 'rule-thin' }),
    h('h2', { style: { fontSize: '20px', marginBottom: '10px' } }, 'Export'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => downloadText(`incidenty-${stamp}.csv`, toCsv(all.incidenty, [
        { label: 'Nález', get: (i) => i.casNalezu }, { label: 'Toaleta', get: (i) => i.toaleta }, { label: 'Druh', get: (i) => KATEGORIE[i.kategorie] },
        { label: 'Okno od', get: (i) => i.oknoOd }, { label: 'V okně', get: (i) => incidentVisitors(i, all.navstevy).length },
        { label: 'Stav', get: (i) => i.stav }, { label: 'Nahlásil', get: (i) => i.jmeno }, { label: 'Popis', get: (i) => i.popis }, { label: 'Závěr', get: (i) => i.zaver }])) }, 'Incidenty (CSV)'),
      h('button', { class: 'btn', onclick: () => downloadText(`kontroly-${stamp}.csv`, toCsv(all.kontroly, [
        { label: 'Čas', get: (k) => k.cas }, { label: 'Toaleta', get: (k) => k.toaleta }, { label: 'Stav', get: (k) => k.stav },
        { label: 'Kontroloval', get: (k) => k.jmeno || k.kontroloval }, { label: 'Role', get: (k) => k.role }, { label: 'Slot', get: (k) => k.slot }])) }, 'Kontroly (CSV)'),
      h('button', { class: 'btn', onclick: () => downloadText(`odchody-${stamp}.csv`, toCsv(all.navstevy, [
        { label: 'Odchod', get: (n) => n.casOd }, { label: 'Návrat', get: (n) => n.casDo }, { label: 'Žák', get: (n) => studentName(zMap.get(n.zak)) },
        { label: 'Třída', get: (n) => zMap.get(n.zak)?.trida }, { label: 'Toaleta', get: (n) => n.toaleta }, { label: 'Zdroj', get: (n) => n.zdroj }])) }, 'Odchody žáků (CSV)')),
    h('p', { class: 'muted small' }, 'Export s jmény žáků je osobní údaj. Neukládej ho mimo školní úložiště a po použití smaž.'),
    ctx.demo ? [h('hr', { class: 'rule-thin' }),
      h('button', { class: 'btn ghost', onclick: async () => {
        if (await confirmDialog('Smazat všechny změny a vygenerovat nová ukázková data?', { ok: 'Obnovit' })) { await ctx.store.reset(); location.reload(); }
      } }, 'Obnovit ukázková data')] : null);
}

// ================= INSTALACE =================
async function instalace(el, ctx) {
  const log = h('pre', { class: 'box', style: { whiteSpace: 'pre-wrap', minHeight: '120px', fontFamily: 'var(--mono)', fontSize: '14px' } }, 'Připraveno.');
  const line = (t) => { log.textContent += `\n${t}`; };
  mount(el,
    ...H('Správa', 'Instalace SharePointu', 'Jednorázově založí seznamy a sloupce na webu SharePointu. Bezpečné spustit opakovaně – existující data nemění.'),
    h('div', { class: 'box fill' }, h('h4', null, 'Nastavení z config.js'),
      h('p', { class: 'num', style: { margin: 0 } }, `Web: https://${CONFIG.sharepoint.hostname}${CONFIG.sharepoint.sitePath}`),
      h('p', { class: 'num', style: { margin: 0 } }, `Složka fotek: Dokumenty/${CONFIG.sharepoint.photoFolder}`)),
    h('div', { class: 'btn-row', style: { margin: '16px 0' } },
      h('button', { class: 'btn primary', onclick: async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        try { await ctx.store.install(line); await ctx.reloadRef(); toast('Instalace hotová.'); } catch (err) { line(`CHYBA: ${err.message}`); }
        b.disabled = false;
      } }, 'Zkontrolovat a založit seznamy')),
    log,
    h('p', { class: 'muted small' }, 'Při prvním spuštění se Microsoft zeptá na oprávnění „Sites.Manage.All“ – je potřeba jen pro tento krok.'));
}

