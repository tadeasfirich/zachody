// Dozor u dveří (zvýšený dohled): dozor ťuká žáky, kteří vchází na toaletu.

import { h, mount, mark, toast, uid, fmt, studentName, normalize } from '../ui.js';
import { myDuties, minOfDay, dateKey, period } from '../time.js';
import { PATRA } from '../store/schema.js';
import { dozorNav, wcBadge } from './common.js';


export async function render(el, ctx) {
  const ref = ctx.ref;
  const now = new Date();
  const KEY = `dozor-dvere:${ctx.user.email}`;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* nic */ }
  const zMap = new Map(ref.zaci.map((z) => [z.id, z]));

  // výchozí toaleta: patro mého dozoru, jinak poslední použitá
  const duty = myDuties(ctx.user.email, now, ref).find((d) => minOfDay(now) <= d.br.do + 10);
  let wcId = saved.wc && ref.toalety.some((t) => t.id === saved.wc) ? saved.wc : null;
  if (!wcId && duty) wcId = ref.toalety.find((t) => Number(t.patro) === Number(duty.patro))?.id;
  if (!wcId) wcId = ref.toalety[0]?.id;
  let openClass = null;
  let recent = (saved.recent || []).filter((r) => dateKey(r.casOd) === dateKey(now));

  const today = dateKey(now);
  const zd = ref.zvysenyDohled.filter((z) => z.od <= today && z.do >= today);

  const wc = () => ref.toalety.find((t) => t.id === wcId);
  const persist = () => localStorage.setItem(KEY, JSON.stringify({ wc: wcId, recent: recent.slice(0, 30) }));

  const body = h('div');
  draw();
  const timer = setInterval(drawRecent, 5000);
  return () => clearInterval(timer);

  function draw() {
    const t = wc();
    const p = period(new Date(), ref.zvoneni);
    const wcChips = h('div', { class: 'seg' }, ref.toalety.filter((x) => x.aktivni !== false).map((x) => h('button', {
      'aria-pressed': String(x.id === wcId), onclick: () => { wcId = x.id; openClass = null; persist(); draw(); },
    }, wcBadge(x, 'plain', 'sm'), x.nazev)));
    const search = h('input', { type: 'search', placeholder: 'Příjmení – stačí 3 písmena', 'aria-label': 'Hledat žáka', style: { fontSize: '19px', minHeight: '54px' } });
    const hits = h('div', { class: 'student-grid', style: { marginTop: '8px' } });
    search.addEventListener('input', () => {
      const q = normalize(search.value);
      if (q.length < 3) { mount(hits); return; }
      const list = ref.zaci.filter((z) => z.aktivni !== false && normalize(z.prijmeni).startsWith(q)).slice(0, 12);
      mount(hits, list.length ? list.map((z) => tile(z, true, () => { search.value = ''; mount(hits); })) : h('p', { class: 'muted' }, 'Nikoho takového nevidím.'));
    });

    mount(el,
      dozorNav(ctx, 'dozor'),
      h('div', { class: 'eyebrow' }, 'Dozor u dveří'),
      h('div', { class: 'wc-head' }, t ? wcBadge(t, 'plain', 'lg') : null, h('h1', { class: 'title' }, t ? t.nazev : 'Vyber toaletu')),
      h('p', { class: 'sub' }, 'Stůj u dveří a ťukni každého, kdo vchází. Odchod zapisovat nemusíš.'),
      h('hr', { class: 'rule' }),
      zd.length ? h('div', { class: 'box dark', style: { marginBottom: '14px' } },
        h('h4', null, 'Zvýšený dohled běží'),
        zd.map((z) => h('p', { style: { margin: 0 } }, `${PATRA[z.patro]} do ${fmt.date(z.do)} – ${z.duvod || 'bez udání důvodu'}`))) : null,
      p.type === 'lesson' ? h('p', { class: 'note-strip', style: { marginBottom: '12px' } }, 'Teď běží hodina – odchody z hodin zapisují tablety ve třídách.') : null,
      h('div', { style: { marginBottom: '14px' } }, wcChips),
      search, hits,
      h('h4', { class: 'eyebrow', style: { margin: '16px 0 8px' } }, 'Naposledy zapsaní'),
      h('div', { class: 'door-recent', id: 'door-recent' }),
      h('hr', { class: 'rule-thin' }),
      body);
    drawBody();
  }

  function drawBody() {
    const t = wc();
    // třídy z patra toalety napřed
    const floorOfClass = (tr) => {
      const u = ref.ucebny.find((x) => x.nazev.endsWith(tr.nazev));
      return u ? Number(u.patro) : null;
    };
    const classes = ref.tridy.filter((x) => x.aktivni !== false)
      .sort((a, b) => (floorOfClass(a) === Number(t.patro) ? 0 : 1) - (floorOfClass(b) === Number(t.patro) ? 0 : 1) || a.nazev.localeCompare(b.nazev, 'cs'));

    if (openClass) {
      const kids = ref.zaci.filter((z) => z.aktivni !== false && z.trida === openClass)
        .sort((a, b) => (a.typWC === t.typ ? 0 : 1) - (b.typWC === t.typ ? 0 : 1) || a.prijmeni.localeCompare(b.prijmeni, 'cs'));
      mount(body,
        h('div', { class: 'btn-row', style: { marginBottom: '12px' } },
          h('button', { class: 'btn', onclick: () => { openClass = null; drawBody(); } }, 'Zpět na třídy'),
          h('b', { style: { fontSize: '22px' } }, openClass)),
        h('div', { class: 'student-grid' }, kids.map((z) => tile(z, false))));
    } else {
      mount(body,
        h('div', { class: 'class-grid' }, classes.map((c) => h('button', { class: 'class-tile', onclick: () => { openClass = c.nazev; drawBody(); } }, c.nazev))));
    }
    drawRecent();
  }

  function tile(z, showClass, after) {
    const t = wc();
    return h('button', {
      class: ['student', z.typWC !== t.typ ? 'dim' : ''],
      onclick: () => { enter(z); if (after) after(); },
    }, h('b', null, z.prijmeni), h('span', null, showClass ? `${z.jmeno} – ${z.trida}` : z.jmeno));
  }

  function enter(z) {
    const n = new Date();
    const nav = {
      id: uid(), zak: z.id, toaleta: wcId, casOd: n.toISOString(), casDo: null, zdroj: 'dozor',
      ucebna: '', relace: '', zapsal: ctx.user.email, autoUzavreno: false, incident: '',
    };
    ctx.outbox.add('navstevy', nav);
    recent.unshift({ id: nav.id, zak: z.id, casOd: nav.casOd, wc: wcId, out: null });
    persist();
    drawRecent();
    toast(`${studentName(z, true)} – vstup ${fmt.time(n)}`, { action: 'Vrátit', timeout: 6000, onAction: () => undo(nav.id) });
  }

  function undo(id) {
    const r = recent.find((x) => x.id === id);
    if (!r) return;
    if (Date.now() - new Date(r.casOd) > 60000) { toast('Zápis je starší než minuta, už ho nejde vrátit.'); return; }
    ctx.outbox.remove('navstevy', id);
    recent = recent.filter((x) => x.id !== id);
    persist(); drawRecent();
    toast('Zápis vrácen.');
  }

  function leaveMark(id) {
    const r = recent.find((x) => x.id === id);
    if (!r || r.out) return;
    r.out = new Date().toISOString();
    ctx.outbox.update('navstevy', id, { casDo: r.out });
    persist(); drawRecent();
  }

  function drawRecent() {
    const box = el.querySelector('#door-recent');
    if (!box) return;
    const list = recent.filter((r) => r.wc === wcId).slice(0, 8);
    if (!list.length) { mount(box, h('p', { class: 'muted' }, 'Zatím nikdo.')); return; }
    const n = Date.now();
    mount(box, list.map((r) => {
      const z = zMap.get(r.zak);
      const fresh = n - new Date(r.casOd) < 60000;
      return h('div', { class: 'r' },
        mark(r.out ? 'ok' : 'wait'),
        h('span', { class: 'time' }, fmt.time(r.casOd)),
        h('span', { class: 'sp' }, `${studentName(z)} – ${z ? z.trida : ''}`),
        r.out ? h('span', { class: 'muted small' }, `odešel ${fmt.time(r.out)}`) : h('button', { class: 'btn small ghost', onclick: () => leaveMark(r.id) }, 'Odešel'),
        fresh ? h('button', { class: 'btn small', onclick: () => undo(r.id) }, 'Vrátit') : null);
    }));
  }
}
