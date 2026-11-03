// Značka toalety: číslo patra + symbol (0♂ = přízemí chlapci, 2♀ = 2. patro dívky).
// Stejná značka je na QR štítku na dveřích, takže co člověk vidí na dveřích, vidí i v aplikaci.
//
// Tvar a výplň značky zároveň nesou stav toalety (funguje i černobíle):
//   ok    plný modrý kruh       – dnes zkontrolováno, v pořádku
//   bad   plný černý čtverec    – škoda
//   wait  čárkovaný kruh        – dnes ještě nikdo nekontroloval
//   plain obdélník s linkou     – jen označení toalety, bez stavu (tabulky, výběr)

import { h } from './ui.js';

// ︎ = vždy jako znak, ne jako barevné emoji (iPhone)
export const SYMBOL = { CH: '♂︎', D: '♀︎' };
const STATE_LABEL = { ok: 'v pořádku', bad: 'škoda', wait: 'dnes nekontrolováno' };

export function wcCode(t) {
  if (!t) return '?';
  return `${Number(t.patro)}${SYMBOL[t.typ] || ''}`;
}

// size: 'sm' (do tabulek a tlačítek), '' (seznamy), 'lg' (hlavička), 'xl' (štítek na dveře)
export function wcBadge(t, state = 'plain', size = '') {
  const label = t ? `${t.nazev}${STATE_LABEL[state] ? `, ${STATE_LABEL[state]}` : ''}` : 'Neznámá toaleta';
  return h('span', { class: ['wcb', state, size ? `s-${size}` : ''], role: 'img', 'aria-label': label, title: label },
    h('span', { class: 'wcb-n' }, t ? String(Number(t.patro)) : '?'),
    h('span', { class: 'wcb-s' }, t ? (SYMBOL[t.typ] || '') : ''));
}

// Značka + název, do tabulek a výběrů.
export function wcTag(ref, id) {
  const t = ref.toalety.find((x) => x.id === id);
  return h('span', { class: 'wc-tag' }, wcBadge(t, 'plain', 'sm'), h('span', null, t ? t.nazev : id));
}

export function wcText(ref, id) {
  const t = ref.toalety.find((x) => x.id === id);
  return t ? `${wcCode(t).replace('︎', '')} ${t.nazev}` : id;
}
