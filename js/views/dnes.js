// „Moje dozory“ (učitel) a „Dnes“ (úklid): co mám dnes zkontrolovat a jak jsou na tom toalety.

import { h, mount, mark, fmt } from '../ui.js';
import { slotsForDay, slotLabel, startOfDay, myDuties } from '../time.js';
import { evaluateSlots, toiletStatus } from '../logic.js';
import { KATEGORIE, PATRA } from '../store/schema.js';
import { loadRange } from '../data.js';
import { dozorNav, statusMark, lastCheckText, wcName, legend } from './common.js';

const STATUS = {
  done: ['ok', 'Splněno'],
  missing: ['bad', 'Vynecháno'],
  running: ['wait', 'Právě teď'],
  upcoming: ['opt', 'Čeká'],
  optional: ['none', 'Nepovinné'],
};

export async function render(el, ctx) {
  const now = new Date();
  const ref = ctx.ref;
  const uklid = ctx.user.role === 'uklid';
  mount(el, dozorNav(ctx, 'dnes'), h('p', { class: 'muted' }, 'Načítám…'));
  const data = await loadRange(ctx, { from: startOfDay(now), to: now });

  const parts = [dozorNav(ctx, 'dnes')];
  if (!uklid) {
    const mine = evaluateSlots(slotsForDay(now, ref), data.kontroly, now)
      .filter((s) => s.povinne && String(s.ucitel || '').toLowerCase() === ctx.user.email.toLowerCase());
    const duties = myDuties(ctx.user.email, now, ref);
    parts.push(
      h('div', { class: 'eyebrow' }, `${fmt.day(now)} ${fmt.date(now)}`),
      h('h1', { class: 'title' }, 'Moje dozory dnes'),
      h('hr', { class: 'rule' }),
      duties.length ? h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Přestávka'), h('th', null, 'Toaleta'), h('th', null, 'Kontrola'), h('th', null, 'Stav'))),
        h('tbody', null, mine.map((s) => {
          const [m, l] = STATUS[s.status];
          return h('tr', { class: 'click', onclick: () => { location.hash = `#/kontrola/${s.toaleta}`; } },
            h('td', null, mark(m)),
            h('td', { class: 'nowrap' }, `${s.prestavka}.`),
            h('td', null, wcName(ref, s.toaleta)),
            h('td', { class: 'muted' }, `${slotLabel(s).split(' – ')[1]} (${fmt.time(s.od)}–${fmt.time(s.do)})`),
            h('td', null, s.status === 'done' ? `${l} ${fmt.time(s.kontrola.cas)}` : l));
        })))) : h('div', { class: 'box fill' }, h('p', { style: { margin: 0 } }, 'Dnes nemáš podle plánu žádný dozor. Kontrolu můžeš zapsat kdykoli – stačí naskenovat QR kód.')),
      h('div', { class: 'legend', style: { marginTop: '10px' } },
        h('span', null, mark('ok'), 'splněno'), h('span', null, mark('bad'), 'vynecháno'), h('span', null, mark('wait'), 'právě teď'), h('span', null, mark('opt'), 'čeká')),
      h('hr', { class: 'rule-thin' }));
  } else {
    parts.push(
      h('div', { class: 'eyebrow' }, `${fmt.day(now)} ${fmt.date(now)}`),
      h('h1', { class: 'title' }, 'Toalety dnes'),
      h('hr', { class: 'rule' }));
  }

  // stav všech toalet
  parts.push(h('h2', { style: { fontSize: '20px', marginBottom: '10px' } }, 'Stav toalet'),
    h('div', { class: 'wc-cards' }, ref.toalety.filter((t) => t.aktivni !== false).map((t) => {
      const s = toiletStatus(t.id, data, now);
      const n = data.kontroly.filter((k) => k.toaleta === t.id).length;
      return h('a', { class: ['wc-card', s.state === 'bad' ? 'alert' : ''], href: `#/kontrola/${t.id}` },
        h('span', { class: 'code' }, PATRA[t.patro]),
        h('span', { class: 'head' }, statusMark(s.state), t.typ === 'CH' ? 'Chlapci' : 'Dívky'),
        h('span', { class: 'small muted' }, lastCheckText(s.last, now)),
        h('span', { class: 'small muted' }, `dnes ${n} ${fmt.plural(n, 'kontrola', 'kontroly', 'kontrol')}`));
    })),
    h('div', { style: { marginTop: '10px' } }, legend()));

  // dnešní škody
  const inc = data.incidenty.sort((a, b) => new Date(b.casNalezu) - new Date(a.casNalezu));
  parts.push(h('hr', { class: 'rule-thin' }),
    h('h2', { style: { fontSize: '20px', marginBottom: '10px' } }, 'Dnes nahlášené škody'),
    inc.length ? h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Čas'), h('th', null, 'Toaleta'), h('th', null, 'Druh'), h('th', null, 'Nahlásil(a)'))),
      h('tbody', null, inc.map((i) => h('tr', null,
        h('td', { class: 'num' }, fmt.time(i.casNalezu)), h('td', null, wcName(ref, i.toaleta)),
        h('td', null, KATEGORIE[i.kategorie] || i.kategorie), h('td', null, i.jmeno || i.nahlasil)))))) :
      h('p', { class: 'muted' }, 'Zatím žádné.'));

  mount(el, ...parts);
}
