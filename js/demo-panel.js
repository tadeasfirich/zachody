// Panel Testování (jen testovací prostředí): přepínání účtů, testovací čas, výpadek sítě, data.

import { h, modal, toast, confirmDialog, fmt } from './ui.js';
import { DEMO_USERS, demoLogin } from './auth.js';
import { lessons, breaks, isSchoolDay, startOfDay, addDays, atMin, hmStr } from './time.js';

const CLOCK_KEY = 'zachody-demo-clock';

export const ROLE_GROUPS = [
  ['spravce', 'Správce'],
  ['vedeni', 'Vedení'],
  ['ucitel', 'Učitelé na dozoru'],
  ['uklid', 'Úklid'],
  ['ucebna', 'Tablety v učebnách'],
];

export function switchTo(u) {
  demoLogin(u);
  location.hash = '';
  location.reload();
}

export function newTabUrl(u) {
  return `${location.origin}${location.pathname}?as=${encodeURIComponent(u.email)}`;
}

// Seznam účtů seskupený podle rolí. Kliknutí = přepnout v této záložce, odkaz = nová záložka.
export function accountList(current) {
  return h('div', { class: 'acc-list' }, ROLE_GROUPS.map(([role, label]) => h('section', null,
    h('h3', { class: 'acc-role' }, label),
    h('div', { class: 'acc-grid' }, DEMO_USERS.filter((u) => u.role === role).map((u) => {
      const me = current && current.email === u.email;
      return h('div', { class: ['acc', me ? 'is-me' : ''] },
        h('button', { class: 'acc-main', onclick: () => (me ? null : switchTo(u)), 'aria-current': me ? 'true' : null },
          h('b', null, u.name), h('span', null, me ? 'právě přihlášený' : u.hint)),
        h('a', { class: 'acc-tab', href: newTabUrl(u), target: '_blank', rel: 'noopener', title: 'Otevřít v nové záložce', 'aria-label': `${u.name} v nové záložce`,
          html: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M7 3H3v12h12v-4M10 3h5v5M15 3 8 10" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' }));
    })))));
}

// ---------- testovací čas ----------
function realNow() { return window.__realDate ? new window.__realDate() : new Date(); }
export function clockOffset() { return window.__demoClockOffset || 0; }

function testDay(ref) {
  let d = startOfDay(realNow());
  for (let i = 0; i < 14 && !isSchoolDay(d, ref.dnyBezProvozu); i++) d = addDays(d, -1);
  return d;
}

function presets(ref) {
  const day = testDay(ref);
  const out = [];
  const L = lessons(ref.zvoneni);
  const B = breaks(ref.zvoneni);
  if (L.length) out.push([L[0].od - 15, 'před vyučováním']);
  for (const l of L) {
    out.push([l.od + 15, `${l.hodina}. hodina – žáci odchází na toaletu`]);
    const b = B.find((x) => x.po === l.hodina);
    if (b) {
      out.push([b.od - 2, `konec ${l.hodina}. hodiny – kontrola na začátku přestávky`]);
      out.push([b.do - 2, `konec ${b.po}. přestávky – povinná kontrola`]);
    }
  }
  if (L.length) out.push([L[L.length - 1].do + 20, 'po vyučování – úklid']);
  return out.map(([m, label]) => ({ date: atMin(day, m), label: `${hmStr(m)} – ${label}` }));
}

async function setClock(ctx, target) {
  const off = target ? target.getTime() - realNow().getTime() : 0;
  try {
    if (off) localStorage.setItem(CLOCK_KEY, JSON.stringify({ offset: off }));
    else localStorage.removeItem(CLOCK_KEY);
  } catch { /* nic */ }
  // vygenerované záznamy „z budoucnosti“ pryč, ať se neplete historie s testem
  if (target && target < new Date()) await ctx.store.pruneFuture(target);
  ctx.store.broadcastReload();
  location.reload();
}

export function clockLabel() {
  if (!clockOffset()) return null;
  const n = new Date();
  return `${fmt.dayShort(n)} ${fmt.date(n)} ${fmt.time(n)}`;
}

// ---------- panel ----------
export function openTestPanel(ctx) {
  const ref = ctx.ref;
  modal((close) => {
    const now = new Date();
    const pre = presets(ref);
    const sel = h('select', { 'aria-label': 'Testovací čas' },
      pre.map((p, i) => h('option', { value: i }, `${fmt.dayShort(p.date)} ${fmt.date(p.date)} ${p.label}`)));
    const day = testDay(ref);
    const custom = h('input', { type: 'time', value: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, 'aria-label': 'Vlastní čas' });

    return [
      h('div', { class: 'eyebrow' }, 'Testovací prostředí'),
      h('h2', { class: 'title' }, 'Testování'),
      h('p', { class: 'muted' }, 'Data se ukládají jen do tohoto prohlížeče. Všechny účty je sdílí, takže co zapíše tablet, uvidí hned dozor i vedení.'),
      h('hr', { class: 'rule' }),

      h('h3', { class: 'panel-h' }, 'Přepnout účet'),
      h('p', { class: 'muted small' }, 'Tip: otevři si dvě záložky vedle sebe (třeba tablet 8.A a učitelku na dozoru) – ikona se šipkou vpravo u účtu. Změny z jedné se v druhé ukážou samy.'),
      accountList(ctx.user),

      h('hr', { class: 'rule-thin' }),
      h('h3', { class: 'panel-h' }, 'Testovací čas'),
      h('p', { class: 'muted small' }, clockOffset()
        ? `Aplikace teď běží v čase ${fmt.dayShort(now)} ${fmt.date(now)} ${fmt.time(now)} (skutečně je ${fmt.time(realNow())}). Hodiny běží dál.`
        : 'Aplikace běží ve skutečném čase. Večer nebo o víkendu se ale neučí – posuň si čas do vyučování.'),
      h('div', { class: 'grid c2' },
        h('div', { class: 'stack' }, sel,
          h('button', { class: 'btn primary', onclick: () => setClock(ctx, pre[Number(sel.value)].date) }, 'Nastavit tento čas')),
        h('div', { class: 'stack' }, custom,
          h('button', { class: 'btn', onclick: () => {
            const [hh, mm] = custom.value.split(':').map(Number);
            if (Number.isNaN(hh)) return;
            setClock(ctx, atMin(day, hh * 60 + mm));
          } }, `Nastavit ${fmt.dayShort(day)} ${fmt.date(day)} na vlastní čas`))),
      clockOffset() ? h('button', { class: 'btn ghost', style: { marginTop: '10px' }, onclick: () => setClock(ctx, null) }, 'Vrátit skutečný čas') : null,
      h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'Při posunu do minulosti zmizí vygenerované záznamy z pozdější doby. Co jsi naklikal sám, zůstává.'),

      h('hr', { class: 'rule-thin' }),
      h('h3', { class: 'panel-h' }, 'Síť'),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: ctx.store.simulateOffline || null, onchange: (e) => {
          ctx.store.simulateOffline = e.target.checked;
          toast(e.target.checked ? 'Síť je „vypnutá“. Zápisy počkají v zařízení.' : 'Síť zpět. Odesílám čekající zápisy.');
          if (!e.target.checked) ctx.outbox.flush();
        } }),
        'Simulovat výpadek sítě (jen v této záložce)'),

      h('hr', { class: 'rule-thin' }),
      h('h3', { class: 'panel-h' }, 'Data'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: async () => {
          if (!(await confirmDialog('Smazat všechny odchody, kontroly a incidenty? Žáci, třídy, plán dozorů a další nastavení zůstanou.', { ok: 'Vyprázdnit' }))) return;
          await ctx.store.clearEvents(); location.reload();
        } }, 'Začít s čistým štítem'),
        h('button', { class: 'btn', onclick: async () => {
          if (!(await confirmDialog('Smazat všechno a vygenerovat nová ukázková data (4 týdny provozu)?', { ok: 'Obnovit' }))) return;
          await ctx.store.reset(); location.reload();
        } }, 'Obnovit ukázková data')),
      h('p', { class: 'muted small' }, '„Čistý štít“ se hodí na zkoušku s kolegy: nic z ukázkové historie nepřekáží. Ukázková data zase ukážou statistiky a analýzu.'),

      h('div', { class: 'btn-row', style: { marginTop: '18px' } }, h('button', { class: 'btn ghost', onclick: close }, 'Zavřít')),
    ];
  }, { wide: true });
}
