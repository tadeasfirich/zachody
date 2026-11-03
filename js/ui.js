// Drobné pomocníky pro tvorbu rozhraní bez frameworku.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function mount(el, ...nodes) {
  el.replaceChildren();
  append(el, nodes);
}

export function mark(kind, extra = '') {
  return h('span', { class: `mark ${kind} ${extra}`, 'aria-hidden': 'true' });
}

export function head(eyebrow, title, sub) {
  return [
    eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null,
    h('h1', { class: 'title' }, title),
    sub ? h('p', { class: 'sub' }, sub) : null,
    h('hr', { class: 'rule' }),
  ];
}

export function toast(msg, { action, onAction, timeout = 4000 } = {}) {
  const wrap = document.getElementById('toasts');
  const t = h('div', { class: 'toast', role: 'status' }, h('span', null, msg));
  let done = false;
  const close = () => { if (!done) { done = true; t.remove(); } };
  if (action) {
    t.appendChild(h('button', { onclick: () => { close(); onAction && onAction(); } }, action));
  }
  wrap.appendChild(t);
  setTimeout(close, timeout);
  return close;
}

export function modal(content, { wide = false, onClose } = {}) {
  const dlg = h('div', { class: `dialog ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true' });
  const ov = h('div', { class: 'overlay' }, dlg);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  mount(dlg, typeof content === 'function' ? content(close) : content);
  document.body.appendChild(ov);
  const f = dlg.querySelector('button, input, select, textarea');
  if (f) f.focus();
  return close;
}

export function confirmDialog(text, { ok = 'Potvrdit', cancel = 'Zrušit' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    modal((close) => [
      h('p', { style: { fontSize: '19px' } }, text),
      h('div', { class: 'btn-row', style: { marginTop: '16px' } },
        h('button', { class: 'btn primary', onclick: () => { answered = true; close(); resolve(true); } }, ok),
        h('button', { class: 'btn ghost', onclick: () => { close(); } }, cancel)),
    ], { onClose: () => { if (!answered) resolve(false); } });
  });
}

export function promptDialog(text, { type = 'text', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    let val = null;
    modal((close) => {
      const inp = h('input', { type, placeholder, inputmode: type === 'password' ? 'numeric' : undefined });
      const submit = () => { val = inp.value; close(); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      return [
        h('p', { style: { fontSize: '19px' } }, text), inp,
        h('div', { class: 'btn-row', style: { marginTop: '16px' } },
          h('button', { class: 'btn primary', onclick: submit }, 'Pokračovat'),
          h('button', { class: 'btn ghost', onclick: () => close() }, 'Zrušit')),
      ];
    }, { onClose: () => resolve(val) });
  });
}

export function longPress(el, ms, cb) {
  let timer = null;
  const start = (e) => {
    e.preventDefault();
    el.classList.add('pressing');
    timer = setTimeout(() => { el.classList.remove('pressing'); timer = null; cb(); }, ms);
  };
  const stop = () => { el.classList.remove('pressing'); if (timer) clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  // klávesnice: Enter podržený nefunguje dobře, takže dvojklik jako náhrada
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') cb(); });
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------- formátování (vše v místním čase zařízení = Europe/Prague) ----------
const DNY = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const DNY_KR = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const pad = (n) => String(n).padStart(2, '0');

export const fmt = {
  time(v) { const d = new Date(v); return `${d.getHours()}:${pad(d.getMinutes())}`; },
  date(v) { const d = new Date(v); return `${d.getDate()}. ${d.getMonth() + 1}.`; },
  dateY(v) { const d = new Date(v); return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`; },
  day(v) { return DNY[new Date(v).getDay()]; },
  dayShort(v) { return DNY_KR[new Date(v).getDay()]; },
  dt(v) { return `${fmt.dayShort(v)} ${fmt.date(v)} ${fmt.time(v)}`; },
  mins(a, b) { return Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)); },
  dur(min) {
    if (min < 60) return `${min} min`;
    const hh = Math.floor(min / 60), mm = min % 60;
    if (hh >= 24) { const d = Math.round(min / 1440); return `${d} ${d === 1 ? 'den' : d < 5 ? 'dny' : 'dní'}`; }
    return mm ? `${hh} h ${mm} min` : `${hh} h`;
  },
  ago(v, now = Date.now()) {
    const m = fmt.mins(v, now);
    if (m < 1) return 'právě teď';
    return `před ${fmt.dur(m)}`;
  },
  pct(a, b) { return b ? `${Math.round((a / b) * 100)} %` : '–'; },
  plural(n, one, few, many) { return n === 1 ? one : (n >= 2 && n <= 4) ? few : many; },
};

export function studentName(z, short = false) {
  if (!z) return 'Neznámý žák';
  return short ? `${z.jmeno} ${z.prijmeni[0]}.` : `${z.prijmeni} ${z.jmeno}`;
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type: mime });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function toCsv(rows, cols) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => esc(c.label)).join(';'), ...rows.map((r) => cols.map((c) => esc(c.get(r))).join(';'))].join('\n');
}

export function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
