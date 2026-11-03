// Společné prvky aplikace „Dozor a kontrola“.

import { h, mark, fmt } from '../ui.js';
import { PATRA } from '../store/schema.js';

export function dozorNav(ctx, current) {
  const uklid = ctx.user.role === 'uklid';
  const items = uklid
    ? [['kontrola', 'Kontrola'], ['dnes', 'Dnes']]
    : [['kontrola', 'Kontrola'], ['dozor', 'U dveří'], ['dnes', 'Moje dozory']];
  return h('nav', { class: 'subnav', 'aria-label': 'Části aplikace' },
    items.map(([k, l]) => h('a', { href: `#/${k}`, 'aria-current': k === current ? 'page' : null }, l)));
}

export function wcName(ref, id) {
  const t = ref.toalety.find((x) => x.id === id);
  return t ? t.nazev : id;
}

export function statusMark(state) {
  return mark(state === 'ok' ? 'ok' : state === 'bad' ? 'bad' : 'wait');
}

export function legend() {
  return h('div', { class: 'legend' },
    h('span', null, mark('ok'), 'v pořádku'),
    h('span', null, mark('bad'), 'škoda'),
    h('span', null, mark('wait'), 'dnes nekontrolováno'));
}

export function lastCheckText(last, now = new Date()) {
  if (!last) return 'zatím bez kontroly';
  const res = last.stav === 'ok' ? 'v pořádku' : 'škoda';
  const sameDay = new Date(last.cas).toDateString() === now.toDateString();
  return `${res} – ${sameDay ? fmt.time(last.cas) : fmt.dt(last.cas)}${last.jmeno ? `, ${last.jmeno}` : ''}`;
}

export { PATRA };
