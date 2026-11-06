// Správa: přehled, incidenty, analýza překryvu, plnění kontrol, statistiky.
// Číselníky, import a další nastavení jsou v sprava-nastaveni.js.

import { h, mount, mark, modal, toast, fmt, studentName, downloadText, toCsv } from '../ui.js';
import { slotsForDay, startOfDay, addDays, dateKey, lessons, minOfDay, hmStr, slotLabel } from '../time.js';
import { evaluateSlots, toiletStatus, incidentVisitors, overlapAnalysis, compliance, weeklyCounts, avgWindowMin } from '../logic.js';
import { KATEGORIE, ZAVAZNOST, STAV_INCIDENTU, PATRA } from '../store/schema.js';
import { loadRange, lastDays, photosOf } from '../data.js';
import { lastCheckText, wcName, wcBadge, wcTag } from './common.js';
import { wcText } from '../wc.js';

const PAGES = [
  ['', 'Přehled', 'all'],
  ['incidenty', 'Incidenty', 'all'],
  ['analyza', 'Analýza překryvu', 'all'],
  ['plneni', 'Plnění kontrol', 'all'],
  ['statistiky', 'Statistiky', 'all'],
  ['-', 'Nastavení', 'all'],
  ['rozvrh', 'Rozvrh učeben', 'all'],
  ['zaci', 'Žáci a import', 'spravce'],
  ['nastaveni', 'Číselníky a pravidla', 'spravce'],
  ['qr', 'QR štítky na dveře', 'all'],
  ['data', 'Data a uchování', 'spravce'],
  ['instalace', 'Instalace SharePointu', 'spravce-sp'],
];

export async function render(el, ctx, r) {
  const page = r.params[0] || '';
  const visible = PAGES.filter(([, , who]) => who === 'all' || (who === 'spravce' && ctx.isAdmin()) || (who === 'spravce-sp' && ctx.isAdmin() && !ctx.demo));
  const nav = h('nav', { class: 'admin-nav no-print', 'aria-label': 'Správa' }, visible.map(([k, l]) =>
    k === '-' ? h('div', { class: 'grp' }, l) : h('a', { href: `#/sprava${k ? '/' + k : ''}`, 'aria-current': k === page ? 'page' : null }, l)));
  const main = h('div');
  mount(el, h('div', { class: 'admin' }, nav, main));
  mount(main, h('p', { class: 'muted' }, 'Načítám…'));

  const allowed = visible.some(([k]) => k === page);
  if (!allowed) { mount(main, h('p', null, 'Tahle část je jen pro správce.')); return; }

  if (['rozvrh', 'zaci', 'nastaveni', 'qr', 'data', 'instalace'].includes(page)) {
    const mod = await import('./sprava-nastaveni.js');
    return mod.render(main, ctx, page, r);
  }
  if (page === 'incidenty' && r.params[1]) return incidentDetail(main, ctx, r.params[1]);
  if (page === 'incidenty') return incidents(main, ctx, r);
  if (page === 'analyza') return analysis(main, ctx, r);
  if (page === 'plneni') return plneni(main, ctx, r);
  if (page === 'statistiky') return statistiky(main, ctx, r);
  return prehled(main, ctx);
}

const H = (eyebrow, title, sub) => [
  h('div', { class: 'eyebrow' }, eyebrow),
  h('h1', { class: 'title' }, title),
  sub ? h('p', { class: 'sub' }, sub) : null,
  h('hr', { class: 'rule' }),
];

function periodSelect(value, onChange, opts = [[7, '7 dní'], [14, '14 dní'], [30, '30 dní'], [60, '60 dní'], [90, '90 dní']]) {
  const s = h('select', { onchange: (e) => onChange(Number(e.target.value)) }, opts.map(([v, l]) => h('option', { value: v, selected: v === value || null }, l)));
  return h('label', { class: 'field' }, h('span', null, 'Období'), s);
}

// ================= PŘEHLED =================
async function prehled(el, ctx) {
  const now = new Date();
  const ref = ctx.ref;
  const data = await loadRange(ctx, { from: startOfDay(addDays(now, -30)), to: now });
  const today = startOfDay(now).getTime();
  const todayData = {
    kontroly: data.kontroly.filter((k) => new Date(k.cas) >= today),
    incidenty: data.incidenty,
    navstevy: data.navstevy,
  };
  const slots = evaluateSlots(slotsForDay(now, ref), todayData.kontroly, now);
  const due = slots.filter((s) => s.povinne && (s.status === 'done' || s.status === 'missing'));
  const missing = slots.filter((s) => s.status === 'missing');
  const last7 = data.incidenty.filter((i) => new Date(i.casNalezu) >= addDays(now, -7));
  const prev7 = data.incidenty.filter((i) => new Date(i.casNalezu) < addDays(now, -7) && new Date(i.casNalezu) >= addDays(now, -14));
  const open = data.incidenty.filter((i) => i.stav !== 'uzavreno');
  const avg = avgWindowMin(data.incidenty);
  const dk = dateKey(now);
  const zd = ref.zvysenyDohled.filter((z) => z.od <= dk && z.do >= dk);

  mount(el,
    ...H(`${fmt.day(now)} ${fmt.dateY(now)}`, 'Přehled'),
    ref.nastaveni.upozorneni ? null : h('p', { class: 'phase-note', style: { marginBottom: '14px' } },
      'Upozornění jsou vypnutá (fáze 1 – jen tablety). Zapnout: Číselníky a pravidla → Obecné.'),
    h('div', { class: 'kpis' },
      kpi(last7.length, `škod za 7 dní (týden předtím ${prev7.length})`),
      kpi(open.length, 'otevřených incidentů'),
      kpi(due.length ? fmt.pct(due.filter((s) => s.status === 'done').length, due.length) : '–', `dnešních povinných kontrol splněno (${due.filter((s) => s.status === 'done').length} z ${due.length})`),
      kpi(avg !== null ? fmt.dur(avg) : '–', 'průměrné okno incidentu za 30 dní')),
    h('hr', { class: 'rule-thin' }),
    zd.length ? h('div', { class: 'box dark', style: { marginBottom: '16px' } },
      h('h4', null, 'Zvýšený dohled běží'),
      zd.map((z) => h('p', { style: { margin: 0 } }, `${PATRA[z.patro]}, ${fmt.date(z.od)}–${fmt.date(z.do)}: ${z.duvod}`))) : null,
    h('h2', { style: { fontSize: '20px', marginBottom: '10px' } }, 'Toalety teď'),
    h('div', { class: 'wc-cards' }, ref.toalety.filter((t) => t.aktivni !== false).map((t) => {
      const s = toiletStatus(t.id, data, now);
      return h('a', { class: ['wc-card', s.state === 'bad' ? 'alert' : ''], href: `#/sprava/incidenty?wc=${t.id}` },
        h('span', { class: 'head' }, wcBadge(t, s.state), h('span', null, h('span', { class: 'code' }, PATRA[t.patro]), h('br'), t.typ === 'CH' ? 'Chlapci' : 'Dívky')),
        h('span', { class: 'small muted' }, lastCheckText(s.last, now)),
        s.open.length ? h('span', { class: 'small' }, h('b', null, `${s.open.length} ${fmt.plural(s.open.length, 'otevřený incident', 'otevřené incidenty', 'otevřených incidentů')}`)) : null);
    })),
    h('div', { class: 'grid c2', style: { marginTop: '22px' } },
      h('div', null,
        h('h2', { style: { fontSize: '20px', marginBottom: '10px' } }, 'Dnes vynechané kontroly'),
        missing.length ? h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Přestávka'), h('th', null, 'Toaleta'), h('th', null, 'Dozor'))),
          h('tbody', null, missing.map((s) => h('tr', null,
            h('td', null, slotLabel(s)), h('td', null, wcTag(ref, s.toaleta)), h('td', null, s.ucitelJmeno || h('span', { class: 'muted' }, 'nikdo v plánu')))))) :
          h('p', { class: 'muted' }, due.length ? 'Zatím nic nevypadlo.' : 'Dnes zatím nebyla žádná povinná kontrola.')),
      h('div', null,
        h('h2', { style: { fontSize: '20px', marginBottom: '10px' } }, 'Poslední incidenty'),
        incidentTable(ctx, [...data.incidenty].sort((a, b) => new Date(b.casNalezu) - new Date(a.casNalezu)).slice(0, 6), data.navstevy, { compact: true }))));
}

function kpi(v, l) { return h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(v)), h('div', { class: 'l' }, l)); }

// ================= INCIDENTY =================
function incidentTable(ctx, list, navstevy, { compact = false } = {}) {
  if (!list.length) return h('p', { class: 'muted' }, 'Žádné incidenty.');
  return h('div', { class: 'table-wrap' }, h('table', null,
    h('thead', null, h('tr', null,
      h('th', null, ''), h('th', null, 'Nález'), h('th', null, 'Toaleta'), h('th', null, 'Druh'),
      compact ? null : h('th', null, 'Závažnost'), h('th', { class: 'n' }, 'Okno'), h('th', { class: 'n' }, 'V okně'),
      compact ? null : h('th', null, 'Nahlásil(a)'), h('th', null, 'Stav'))),
    h('tbody', null, list.map((i) => h('tr', { class: 'click', onclick: () => { location.hash = `#/sprava/incidenty/${encodeURIComponent(i.id)}`; } },
      h('td', null, mark(i.stav === 'uzavreno' ? 'ok' : 'bad')),
      h('td', { class: 'nowrap' }, fmt.dt(i.casNalezu)),
      h('td', null, wcBadge(ctx.ref.toalety.find((t) => t.id === i.toaleta), 'plain', 'sm')),
      h('td', null, KATEGORIE[i.kategorie] || i.kategorie),
      compact ? null : h('td', null, ZAVAZNOST[i.zavaznost] || ''),
      h('td', { class: 'n' }, i.siroke ? h('span', { class: 'tag dash', title: 'Široké okno – bez kontroly téhož dne' }, 'široké') : fmt.dur(fmt.mins(i.oknoOd, i.casNalezu))),
      h('td', { class: 'n' }, String(incidentVisitors(i, navstevy).length)),
      compact ? null : h('td', null, i.jmeno || i.nahlasil),
      h('td', null, h('span', { class: ['tag', i.stav === 'novy' ? 'ink' : ''] }, STAV_INCIDENTU[i.stav] || i.stav)))))));
}

async function incidents(el, ctx, r) {
  const ref = ctx.ref;
  let days = Number(r.query.get('d') || 30);
  let wc = r.query.get('wc') || '';
  let stav = r.query.get('s') || '';
  const { from, to } = lastDays(days);
  const data = await loadRange(ctx, { from: addDays(from, -3), to, kinds: ['incidenty', 'navstevy'] });
  let list = data.incidenty.filter((i) => new Date(i.casNalezu) >= from)
    .filter((i) => !wc || i.toaleta === wc)
    .filter((i) => !stav || (stav === 'otevrene' ? i.stav !== 'uzavreno' : i.stav === stav))
    .sort((a, b) => new Date(b.casNalezu) - new Date(a.casNalezu));

  const go = () => { location.hash = `#/sprava/incidenty?d=${days}&wc=${wc}&s=${stav}`; };
  mount(el,
    ...H('Správa', 'Incidenty', 'Každá nahlášená škoda s oknem od poslední kontroly a počtem zapsaných žáků v něm.'),
    h('div', { class: 'filters' },
      periodSelect(days, (v) => { days = v; go(); }, [[7, '7 dní'], [30, '30 dní'], [90, '90 dní'], [365, 'rok']]),
      h('label', { class: 'field' }, h('span', null, 'Toaleta'),
        h('select', { onchange: (e) => { wc = e.target.value; go(); } },
          h('option', { value: '' }, 'Všechny'),
          ref.toalety.map((t) => h('option', { value: t.id, selected: t.id === wc || null }, wcText(ref, t.id))))),
      h('label', { class: 'field' }, h('span', null, 'Stav'),
        h('select', { onchange: (e) => { stav = e.target.value; go(); } },
          [['', 'Všechny'], ['otevrene', 'Otevřené'], ['novy', 'Nové'], ['resi-se', 'Řeší se'], ['uzavreno', 'Uzavřené']]
            .map(([v, l]) => h('option', { value: v, selected: v === stav || null }, l)))),
      h('button', { class: 'btn ghost', onclick: () => downloadText(`incidenty-${dateKey(new Date())}.csv`, toCsv(list, [
        { label: 'Nález', get: (i) => fmt.dt(i.casNalezu) }, { label: 'Toaleta', get: (i) => wcText(ref, i.toaleta) },
        { label: 'Druh', get: (i) => KATEGORIE[i.kategorie] }, { label: 'Závažnost', get: (i) => ZAVAZNOST[i.zavaznost] },
        { label: 'Okno od', get: (i) => fmt.dt(i.oknoOd) }, { label: 'V okně', get: (i) => incidentVisitors(i, data.navstevy).length },
        { label: 'Nahlásil', get: (i) => i.jmeno }, { label: 'Stav', get: (i) => STAV_INCIDENTU[i.stav] }, { label: 'Popis', get: (i) => i.popis },
        { label: 'Závěr', get: (i) => i.zaver }])) }, 'Stáhnout CSV')),
    h('p', { class: 'muted small' }, `${list.length} ${fmt.plural(list.length, 'incident', 'incidenty', 'incidentů')}`),
    incidentTable(ctx, list, data.navstevy));
}

async function incidentDetail(el, ctx, id) {
  const ref = ctx.ref;
  const now = new Date();
  await ctx.outbox.flush().catch(() => {});
  const inc = await ctx.store.get('incidenty', id);
  if (!inc) { mount(el, ...H('Incident', 'Nenalezen'), h('a', { class: 'btn', href: '#/sprava/incidenty' }, 'Zpět na incidenty')); return; }
  const t = ref.toalety.find((x) => x.id === inc.toaleta);
  const data = await loadRange(ctx, { from: addDays(startOfDay(now), -60), to: now, kinds: ['incidenty', 'navstevy'] });
  const visitors = incidentVisitors(inc, data.navstevy);
  const zMap = new Map(ref.zaci.map((z) => [z.id, z]));
  // v kolika jiných oknech (60 dní) se žák objevil
  const otherWins = new Map();
  for (const o of data.incidenty) {
    if (o.id === inc.id) continue;
    for (const v of incidentVisitors(o, data.navstevy)) otherWins.set(v.zak, (otherWins.get(v.zak) || 0) + 1);
  }
  const photos = h('div', { class: 'photos large' }, h('span', { class: 'muted' }, 'Načítám fotky…'));
  photosOf(ctx, inc.id).then((ps) => mount(photos, ps.length ? ps.map((p) => h('a', { href: p.url, target: '_blank', rel: 'noopener' }, h('img', { src: p.url, alt: `Fotka ${p.name}` }))) : h('span', { class: 'muted' }, 'Bez fotek.')));

  const stavSel = h('select', null, Object.entries(STAV_INCIDENTU).map(([k, l]) => h('option', { value: k, selected: k === inc.stav || null }, l)));
  const zaver = h('textarea', { placeholder: 'Co se zjistilo, jak se škoda vyřešila' }, inc.zaver || '');
  const winMin = fmt.mins(inc.oknoOd, inc.casNalezu);
  const names = ctx.canSeeNames(inc.nahlasil);

  mount(el,
    h('a', { href: '#/sprava/incidenty', class: 'no-print' }, '← Incidenty'),
    h('div', { class: 'wc-head' }, wcBadge(t, inc.stav === 'uzavreno' ? 'plain' : 'bad', 'lg'),
      h('div', null, h('div', { class: 'eyebrow' }, `Incident – ${t ? t.nazev : inc.toaleta}`),
        h('h1', { class: 'title' }, `${KATEGORIE[inc.kategorie] || inc.kategorie}, ${fmt.dt(inc.casNalezu)}`))),
    h('hr', { class: 'rule' }),
    h('div', { class: 'grid c3' },
      h('div', { class: 'box' }, h('h4', null, 'Nahlásil(a)'), h('p', { style: { margin: 0 } }, inc.jmeno || inc.nahlasil), h('p', { class: 'muted small', style: { margin: 0 } }, inc.role === 'uklid' ? 'úklid' : 'dozor')),
      h('div', { class: 'box' }, h('h4', null, 'Závažnost'), h('p', { style: { margin: 0 } }, ZAVAZNOST[inc.zavaznost] || '–')),
      h('div', { class: inc.siroke ? 'box dashed' : 'box' }, h('h4', null, 'Okno'),
        h('p', { style: { margin: 0 } }, h('b', null, `${fmt.dt(inc.oknoOd)} – ${fmt.time(inc.casNalezu)}`)),
        h('p', { class: 'muted small', style: { margin: 0 } }, inc.siroke ? 'Široké okno: ten den chyběla dřívější kontrola.' : `${fmt.dur(winMin)} od poslední kontroly`))),
    inc.popis ? h('p', { class: 'note-strip', style: { marginTop: '14px' } }, inc.popis) : null,
    h('h2', { style: { fontSize: '20px', margin: '20px 0 10px' } }, 'Fotky'), photos,
    h('h2', { style: { fontSize: '20px', margin: '22px 0 6px' } }, `V okně ${visitors.length} ${fmt.plural(visitors.length, 'žák', 'žáci', 'žáků')}`),
    h('p', { class: 'muted small' }, 'Být v okně neznamená škodu způsobit. Sloupec „Jiná okna“ ukazuje, v kolika dalších incidentech za 60 dní se žák objevil – vzorec je zajímavější než jednotlivost.'),
    names ? h('div', { class: 'table-wrap no-print' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Žák'), h('th', null, 'Třída'), h('th', null, 'Odchod'), h('th', null, 'Návrat'), h('th', null, 'Zapsáno'), h('th', { class: 'n' }, 'Jiná okna'))),
      h('tbody', null, visitors.map((v) => {
        const z = zMap.get(v.zak);
        const o = otherWins.get(v.zak) || 0;
        return h('tr', null, h('td', null, h('b', null, studentName(z))), h('td', null, z ? z.trida : ''),
          h('td', { class: 'num' }, fmt.time(v.casOd)), h('td', { class: 'num' }, v.casDo ? fmt.time(v.casDo) + (v.autoUzavreno ? ' (auto)' : '') : '–'),
          h('td', null, v.zdroj === 'dozor' ? 'dozor u dveří' : ref.ucebny.find((u) => u.id === v.ucebna)?.nazev || 'tablet'),
          h('td', { class: 'n' }, o ? h('b', null, String(o)) : '0'));
      })))) : h('p', null, 'Jména vidí vedení a správce.'),
    h('p', { class: 'print-only' }, `Počet zapsaných žáků v okně: ${visitors.length}. Jména nejsou v tisku uvedena.`),
    h('hr', { class: 'rule-thin' }),
    ctx.canManage() ? h('div', { class: 'grid c2 no-print' },
      h('div', { class: 'stack' },
        h('label', { class: 'field' }, h('span', null, 'Stav'), stavSel),
        h('label', { class: 'field' }, h('span', null, 'Závěr'), zaver),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', onclick: async () => {
            await ctx.outbox.update('incidenty', inc.id, { stav: stavSel.value, zaver: zaver.value.trim() });
            toast('Incident uložen.');
          } }, 'Uložit'),
          h('button', { class: 'btn ghost', onclick: () => window.print() }, 'Tisk pro jednání (bez jmen)'))),
      h('div', { class: 'box fill' },
        h('h4', null, 'Další krok'),
        h('p', null, `Opakuje se to na ${t ? PATRA[t.patro] : 'tomto patře'}? Zapni zvýšený dohled: dozor bude o přestávkách u dveří zapisovat vstupy.`),
        h('button', { class: 'btn', onclick: () => startZd(ctx, t) }, 'Spustit zvýšený dohled'))) : null);
}

function startZd(ctx, t) {
  modal((close) => {
    const dny = h('select', null, [[3, '3 školní dny'], [5, 'týden'], [10, '2 týdny']].map(([v, l]) => h('option', { value: v }, l)));
    const duvod = h('input', { type: 'text', value: `Opakované škody – ${t.nazev}` });
    return [
      h('div', { class: 'eyebrow' }, PATRA[t.patro]),
      h('h2', { class: 'title' }, 'Zvýšený dohled'),
      h('p', { class: 'muted' }, 'Dozor na patře bude o přestávkách stát u dveří a ťukat vstupy. Učitelé to uvidí v aplikaci.'),
      h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', null, 'Na jak dlouho'), dny), h('label', { class: 'field' }, h('span', null, 'Důvod'), duvod)),
      h('div', { class: 'btn-row', style: { marginTop: '16px' } },
        h('button', { class: 'btn primary', onclick: async () => {
          const n = Number(dny.value);
          let d = new Date(), c = 0;
          while (c < n) { if (d.getDay() % 6 !== 0) c++; if (c < n) d = addDays(d, 1); }
          const list = [...ctx.ref.zvysenyDohled, { id: `zd-${Date.now()}`, patro: Number(t.patro), od: dateKey(new Date()), do: dateKey(d), duvod: duvod.value }];
          await ctx.store.saveRef('zvysenyDohled', list);
          await ctx.reloadRef();
          close(); toast('Zvýšený dohled zapnut.');
        } }, 'Zapnout'),
        h('button', { class: 'btn ghost', onclick: close }, 'Zrušit')),
    ];
  });
}

// ================= ANALÝZA PŘEKRYVU =================
async function analysis(el, ctx, r) {
  const ref = ctx.ref;
  let days = Number(r.query.get('d') || 30);
  const patroQ = r.query.get('p');
  let patro = patroQ === null || patroQ === '' ? null : Number(patroQ);
  const { from, to } = lastDays(days);
  const data = await loadRange(ctx, { from: addDays(from, -3), to, kinds: ['incidenty', 'navstevy'] });
  const incs = data.incidenty.filter((i) => new Date(i.casNalezu) >= from);
  const nav = data.navstevy.filter((n) => new Date(n.casOd) >= addDays(from, -3));
  const A = overlapAnalysis({ incidenty: incs, navstevy: nav, zaci: ref.zaci, tridy: ref.tridy, ref, from, to, patro });
  const go = () => { location.hash = `#/sprava/analyza?d=${days}&p=${patro === null ? '' : patro}`; };
  const maxEx = Math.max(1, ...A.students.map((s) => s.excess), ...A.pairs.map((s) => s.excess));
  const incMap = new Map(incs.map((i) => [i.id, i]));
  const showIncidents = (title, ids) => modal((close) => [
    h('h2', { class: 'title' }, title), h('hr', { class: 'rule' }),
    h('table', null, h('tbody', null, ids.map((id) => incMap.get(id)).filter(Boolean).map((i) => h('tr', { class: 'click', onclick: () => { close(); location.hash = `#/sprava/incidenty/${encodeURIComponent(i.id)}`; } },
      h('td', null, fmt.dt(i.casNalezu)), h('td', null, wcTag(ref, i.toaleta)), h('td', null, KATEGORIE[i.kategorie]))))),
    h('div', { class: 'btn-row', style: { marginTop: '14px' } }, h('button', { class: 'btn ghost', onclick: close }, 'Zavřít')),
  ]);
  const exBar = (v) => h('div', { class: 'bar ink', title: `${v.toFixed(1)} nad očekávání` }, h('i', { style: { width: `${Math.max(0, (v / maxEx) * 100)}%` } }));
  const limit = (arr, n) => arr.slice(0, n);

  mount(el,
    ...H('Správa', 'Analýza překryvu', 'Kdo se opakovaně objevuje v oknech incidentů víc, než by odpovídalo tomu, jak často na toaletu chodí.'),
    h('div', { class: 'box dark', style: { marginBottom: '18px' } },
      h('h4', null, 'Indicie, ne důkaz'),
      h('p', { style: { margin: 0 } }, 'Před jakýmkoli krokem mluv se žákem a postupuj podle školního řádu. Tablet může zapsat i někdo jiný a o přestávkách se bez zvýšeného dohledu nic nezapisuje.')),
    h('div', { class: 'filters' },
      periodSelect(days, (v) => { days = v; go(); }),
      h('label', { class: 'field' }, h('span', null, 'Patro'),
        h('select', { onchange: (e) => { patro = e.target.value === '' ? null : Number(e.target.value); go(); } },
          h('option', { value: '' }, 'Všechna'),
          [0, 1, 2].map((p) => h('option', { value: p, selected: p === patro || null }, PATRA[p]))))),
    h('p', { class: 'muted small' }, `${A.incidents} ${fmt.plural(A.incidents, 'incident', 'incidenty', 'incidentů')} v období. Očekávaný počet vychází z toho, jak často žák na danou toaletu chodí, a z délky oken. Žák, který chodí často, má vysoké „očekávaně“ a nahoru se nedostane jen proto.`),
    A.incidents < 3 ? h('div', { class: 'box fill' }, 'Na spolehlivý vzorec je potřeba aspoň 3–5 incidentů s úzkým oknem. Zkus delší období.') : null,

    h('h2', { style: { fontSize: '20px', margin: '18px 0 8px' } }, 'Žáci ve 2 a více oknech'),
    A.students.length ? h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Žák'), h('th', null, 'Třída'), h('th', { class: 'n' }, 'V oknech'), h('th', { class: 'n' }, 'Incidentů na jeho WC'), h('th', { class: 'n' }, 'Očekávaně'), h('th', null, 'Nad očekávání'))),
      h('tbody', null, limit(A.students, 20).map((s) => h('tr', { class: 'click', onclick: () => showIncidents(studentName(s.z), s.incidents) },
        h('td', null, h('b', null, studentName(s.z))), h('td', null, s.z ? s.z.trida : ''),
        h('td', { class: 'n' }, String(s.O)), h('td', { class: 'n' }, String(s.N)), h('td', { class: 'n' }, s.E.toFixed(1)),
        h('td', { style: { minWidth: '140px' } }, exBar(s.excess))))))) : h('p', { class: 'muted' }, 'Nikdo se neobjevil ve dvou oknech.'),

    h('div', { class: 'grid c2', style: { marginTop: '22px' } },
      h('div', null,
        h('h2', { style: { fontSize: '20px', marginBottom: '8px' } }, 'Dvojice, které sdílí okna'),
        A.pairs.length ? h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Dvojice'), h('th', { class: 'n' }, 'Společně'), h('th', { class: 'n' }, 'Očekávaně'))),
          h('tbody', null, limit(A.pairs, 10).map((p) => h('tr', { class: 'click', onclick: () => showIncidents(p.members.map((m) => studentName(m)).join(' + '), p.incidents) },
            h('td', null, p.members.map((m) => `${studentName(m)} (${m ? m.trida : '?'})`).join(' + ')),
            h('td', { class: 'n' }, String(p.O)), h('td', { class: 'n' }, p.E.toFixed(2)))))) : h('p', { class: 'muted' }, 'Žádná dvojice nesdílí 2 a více oken.')),
      h('div', null,
        h('h2', { style: { fontSize: '20px', marginBottom: '8px' } }, 'Trojice'),
        A.triples.length ? h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Trojice'), h('th', { class: 'n' }, 'Společně'))),
          h('tbody', null, limit(A.triples, 8).map((p) => h('tr', { class: 'click', onclick: () => showIncidents('Trojice', p.incidents) },
            h('td', null, p.members.map((m) => `${studentName(m, true)} (${m ? m.trida : '?'})`).join(', ')),
            h('td', { class: 'n' }, String(p.O)))))) : h('p', { class: 'muted' }, 'Žádná trojice nesdílí 2 a více oken.'))),

    h('h2', { style: { fontSize: '20px', margin: '22px 0 8px' } }, 'Podle tříd'),
    A.classes.length ? h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Třída'), h('th', { class: 'n' }, 'Výskytů v oknech'), h('th', { class: 'n' }, 'Očekávaně'), h('th', { class: 'n' }, 'Různých žáků'))),
      h('tbody', null, limit(A.classes, 10).map((c) => h('tr', null,
        h('td', null, h('b', null, c.trida)), h('td', { class: 'n' }, String(c.O)), h('td', { class: 'n' }, c.E.toFixed(1)), h('td', { class: 'n' }, String(c.zaci)))))) : null);
}

// ================= PLNĚNÍ KONTROL =================
async function plneni(el, ctx, r) {
  const ref = ctx.ref;
  let days = Number(r.query.get('d') || 14);
  const { from, to } = lastDays(days);
  const data = await loadRange(ctx, { from, to, kinds: ['kontroly'] });
  const C = compliance(from, to, ref, data.kontroly, new Date());
  const missed = C.slots.filter((s) => s.status === 'missing').sort((a, b) => b.od - a.od);

  mount(el,
    ...H('Správa', 'Plnění kontrol', 'Povinné kontroly podle plánu dozorů a rozpisu. Kontrola se počítá, když proběhne v okně slotu.'),
    h('div', { class: 'filters' }, periodSelect(days, (v) => { days = v; location.hash = `#/sprava/plneni?d=${v}`; }, [[5, '5 dní'], [14, '14 dní'], [30, '30 dní'], [60, '60 dní']])),
    h('div', { class: 'kpis' },
      kpi(fmt.pct(C.done, C.total), `splněno (${C.done} z ${C.total})`),
      kpi(missed.length, 'vynechaných kontrol')),
    ref.planDozoru.length ? null : h('div', { class: 'box dashed', style: { marginTop: '14px' } }, 'Plán dozorů je prázdný, takže aplikace neví, kdo měl kterou kontrolu. Doplň ho v Číselníky a pravidla → Plán dozorů.'),
    h('h2', { style: { fontSize: '20px', margin: '22px 0 8px' } }, 'Podle dozoru'),
    h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Dozor'), h('th', { class: 'n' }, 'Splněno'), h('th', null, ''), h('th', null, 'Naposledy vynecháno'))),
      h('tbody', null, C.people.map((p) => h('tr', { class: 'click', onclick: () => showMissed(p) },
        h('td', null, p.jmeno),
        h('td', { class: 'n' }, `${p.done}/${p.expected}`),
        h('td', { style: { minWidth: '160px' } }, h('div', { class: 'bar', title: fmt.pct(p.done, p.expected) }, h('i', { style: { width: `${(p.done / Math.max(1, p.expected)) * 100}%` } }))),
        h('td', null, p.lastMissed ? fmt.dt(p.lastMissed) : h('span', { class: 'muted' }, 'nic'))))))),
    h('p', { class: 'muted small' }, 'Kliknutím na řádek uvidíš konkrétní vynechané kontroly. Čísla slouží k domluvě, ne k pranýři – často jde o kolizi s jinou povinností.'),
    h('h2', { style: { fontSize: '20px', margin: '22px 0 8px' } }, 'Poslední vynechané'),
    missed.length ? h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Den'), h('th', null, 'Přestávka'), h('th', null, 'Toaleta'), h('th', null, 'Dozor'))),
      h('tbody', null, missed.slice(0, 25).map((s) => h('tr', null,
        h('td', { class: 'nowrap' }, `${fmt.dayShort(s.od)} ${fmt.date(s.od)}`), h('td', null, slotLabel(s)),
        h('td', null, wcTag(ref, s.toaleta)), h('td', null, s.ucitelJmeno || '–')))))) : h('p', { class: 'muted' }, 'Nic nevypadlo.'));

  function showMissed(p) {
    modal((close) => [
      h('h2', { class: 'title' }, p.jmeno), h('p', { class: 'muted' }, `Splněno ${p.done} z ${p.expected}`), h('hr', { class: 'rule' }),
      p.missed.length ? h('table', null, h('tbody', null, p.missed.sort((a, b) => b.od - a.od).map((s) => h('tr', null,
        h('td', { class: 'nowrap' }, `${fmt.dayShort(s.od)} ${fmt.date(s.od)}`), h('td', null, slotLabel(s)), h('td', null, wcTag(ref, s.toaleta)))))) : h('p', null, 'Bez vynechání.'),
      h('div', { class: 'btn-row', style: { marginTop: '14px' } }, h('button', { class: 'btn ghost', onclick: close }, 'Zavřít')),
    ]);
  }
}

// ================= STATISTIKY =================
async function statistiky(el, ctx, r) {
  const ref = ctx.ref;
  let days = Number(r.query.get('d') || 60);
  const { from, to } = lastDays(days);
  const data = await loadRange(ctx, { from, to, kinds: ['incidenty'] });
  const incs = data.incidenty;
  const weeks = weeklyCounts(incs, from, to);
  const maxW = Math.max(1, ...weeks.map((w) => w.n));
  const byWc = ref.toalety.map((t) => ({ t, n: incs.filter((i) => i.toaleta === t.id).length }));
  const maxWc = Math.max(1, ...byWc.map((x) => x.n));
  const byKat = Object.entries(KATEGORIE).map(([k, l]) => ({ l, n: incs.filter((i) => i.kategorie === k).length })).filter((x) => x.n);
  const avg = avgWindowMin(incs);
  const wide = incs.filter((i) => i.siroke).length;

  // kdy se škoda najde: den × „po kolikáté hodině“
  const L = lessons(ref.zvoneni);
  const cols = [...L.map((l) => ({ key: l.hodina, label: `po ${l.hodina}.`, od: l.od })), { key: 'odp', label: 'odpol.' }];
  const bucket = (d) => {
    const m = minOfDay(d);
    let last = null;
    for (const l of L) if (m >= l.do - 5) last = l.hodina;
    if (last === null) return L[0].hodina;
    return m > L[L.length - 1].do + 30 ? 'odp' : last;
  };
  const heat = new Map();
  for (const i of incs) {
    const d = new Date(i.casNalezu);
    const k = `${(d.getDay() + 6) % 7}|${bucket(d)}`;
    heat.set(k, (heat.get(k) || 0) + 1);
  }
  const maxH = Math.max(1, ...heat.values());
  const shade = (n) => {
    if (!n) return { background: 'var(--fill)', color: 'var(--muted)' };
    const a = 0.18 + 0.82 * (n / maxH);
    return { background: `rgba(42, 75, 155, ${a.toFixed(2)})`, color: a > 0.55 ? '#fff' : 'var(--ink)' };
  };

  mount(el,
    ...H('Správa', 'Statistiky'),
    h('div', { class: 'filters' }, periodSelect(days, (v) => { days = v; location.hash = `#/sprava/statistiky?d=${v}`; }, [[30, '30 dní'], [60, '60 dní'], [90, '90 dní'], [180, 'půl roku']])),
    h('div', { class: 'kpis' },
      kpi(incs.length, 'incidentů v období'),
      kpi(avg !== null ? fmt.dur(avg) : '–', 'průměrné okno (čím kratší, tím lépe)'),
      kpi(fmt.pct(wide, incs.length), 'incidentů se širokým oknem')),

    h('h2', { style: { fontSize: '20px', margin: '24px 0 4px' } }, 'Incidenty po týdnech'),
    h('div', { class: 'chart-bars', role: 'img', 'aria-label': 'Počet incidentů po týdnech' }, weeks.map((w) =>
      h('div', { class: 'col', title: `Týden od ${fmt.date(w.od)}: ${w.n}` }, h('b', null, String(w.n)), h('i', { style: { height: `${(w.n / maxW) * 130}px`, borderRadius: '2px 2px 0 0' } })))),
    h('div', { class: 'chart-labels' }, weeks.map((w) => h('span', null, fmt.date(w.od)))),

    h('div', { class: 'grid c2', style: { marginTop: '26px' } },
      h('div', null,
        h('h2', { style: { fontSize: '20px', marginBottom: '8px' } }, 'Podle toalety'),
        h('table', null, h('tbody', null, byWc.map((x) => h('tr', null,
          h('td', null, wcTag(ref, x.t.id)), h('td', { class: 'n' }, String(x.n)),
          h('td', { style: { width: '45%' } }, h('div', { class: 'bar', title: `${x.n}` }, h('i', { style: { width: `${(x.n / maxWc) * 100}%` } })))))))),
      h('div', null,
        h('h2', { style: { fontSize: '20px', marginBottom: '8px' } }, 'Podle druhu'),
        byKat.length ? h('table', null, h('tbody', null, byKat.sort((a, b) => b.n - a.n).map((x) => h('tr', null, h('td', null, x.l), h('td', { class: 'n' }, String(x.n)))))) : h('p', { class: 'muted' }, 'Žádné incidenty.'))),

    h('h2', { style: { fontSize: '20px', margin: '26px 0 4px' } }, 'Kdy se škoda najde'),
    h('p', { class: 'muted small' }, 'Den v týdnu × po kolikáté hodině kontrola škodu objevila. Tmavší = víc incidentů.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'heat' },
      h('thead', null, h('tr', null, h('th', { class: 'rowh' }, ''), cols.map((c) => h('th', null, c.label)))),
      h('tbody', null, ['po', 'út', 'st', 'čt', 'pá'].map((d, di) => h('tr', null,
        h('th', { class: 'rowh' }, d),
        cols.map((c) => { const n = heat.get(`${di}|${c.key}`) || 0; return h('td', { style: shade(n), title: `${d} ${c.label} hodině: ${n}` }, n ? String(n) : ''); })))))));
}

