// Tablet ve třídě: odchody a návraty žáků.
// Hodina se spustí sama podle rozvrhu učebny (Správa → Rozvrh učeben). Když tam je jiná třída,
// učitel ji kdykoli během hodiny opraví tlačítkem „Jiná třída“ – zápisy z hodiny zůstanou.
// Bez rozvrhu tablet na začátku hodiny ukáže výběr třídy.
// Stav tabletu (kdo je venku, jaká hodina běží) se drží v zařízení, aby fungoval i bez sítě.

import { h, mount, mark, modal, toast, longPress, uid, fmt, studentName, promptDialog, normalize } from '../ui.js';
import { period, dateKey, isoDay, isSchoolDay, atMin } from '../time.js';
import { PATRA, rozvrhFor, rozvrhLabel } from '../store/schema.js';
import * as auth from '../auth.js';
import { wcBadge } from '../wc.js';

const ADMIN_ROOM_KEY = 'tablet-admin-ucebna';
// Stav se drží zvlášť pro každou učebnu (v testu se mezi tablety přepíná v jednom prohlížeči).
let stateKey = 'tablet-state';

function loadState() {
  try { return JSON.parse(localStorage.getItem(stateKey) || '{}'); } catch { return {}; }
}
function saveState(s) { try { localStorage.setItem(stateKey, JSON.stringify(s)); } catch { /* plné úložiště */ } }

export async function render(el, ctx) {
  const ref = ctx.ref;
  const user = ctx.user;
  let st = {};

  let timer = null, clockEl = null, lastKey = null, lastSig = 0;
  // Ručně otevřená obrazovka (výběr třídy) zůstane, dokud se nezmění stav (konec hodiny, přestávky…).
  let pinned = null;

  // ---- která učebna ----
  let roomId = user.role === 'ucebna' ? user.ucebna : localStorage.getItem(ADMIN_ROOM_KEY);
  const room = () => ref.ucebny.find((u) => u.id === roomId);
  if (user.role === 'ucebna' && !room()) {
    mount(el, h('div', { class: 'state-screen' }, mark('wait', 'huge'),
      h('h1', { class: 'title' }, 'Tablet není přiřazený k učebně'),
      h('p', { class: 'sub' }, `Účet ${user.email} chybí v seznamu učeben. Správce ho doplní v Nastavení → Učebny.`)));
    return;
  }
  if (!room()) return chooseRoom();

  stateKey = `tablet-state:${roomId}`;
  st = loadState();
  st.ucebnaId = roomId;
  st.venku = st.venku || [];
  st.autoClosed = st.autoClosed || [];
  st.historie = st.historie || [];

  const autoMin = Number(ref.nastaveni.autoUzavreniMin || 10);
  const maxOut = () => Math.max(1, Number(room().maxVenku || 1));
  const zMap = new Map(ref.zaci.map((z) => [z.id, z]));
  let override = false;
  let outStripEl = null, gridWrap = null;

  tick(true);
  timer = setInterval(() => tick(false), 1000);
  return () => clearInterval(timer);

  // ---------- smyčka ----------
  function tick(force) {
    const now = new Date();
    if (clockEl) clockEl.textContent = fmt.time(now);
    const sig = Math.floor(now.getTime() / 10000);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    autoClose(now);
    autoStart(now);
    const key = screenKey(now);
    if (pinned && !force) { if (key === pinned) return; pinned = null; }
    if (force || key !== lastKey) { pinned = null; lastKey = key; draw(now); }
    else if (key.startsWith('main')) {
      drawOutStrip(now);
    }
  }

  function currentLesson(now) {
    if (!isSchoolDay(now, ref.dnyBezProvozu)) return null;
    const p = period(now, ref.zvoneni);
    return p.type === 'lesson' ? p : null;
  }

  function relaceActive(now) {
    const r = st.relace;
    if (!r || r.datum !== dateKey(now)) return false;
    if (r.hodina === 'mimo') return now - new Date(r.zacatek) < 50 * 60000;
    const p = currentLesson(now);
    if (p && String(p.lesson.hodina) === String(r.hodina)) return true;
    // relace založená o přestávce pro další hodinu
    const pp = period(now, ref.zvoneni);
    return pp.type === 'break' && String(pp.next.hodina) === String(r.hodina);
  }

  // ---------- rozvrh ----------
  function scheduled(hodina, now) {
    if (hodina === 'mimo') return null;
    return rozvrhFor(ref, roomId, isoDay(now), hodina);
  }
  function sameLesson(x, now, hod) { return !!x && x.datum === dateKey(now) && x.hodina === String(hod); }

  // Na začátku hodiny: podle rozvrhu spusť hodinu sám (nebo označ volno).
  // Neudělá to, když učitel tuhle hodinu rozvrh odmítl (ukončil hodinu, „přece jen tu někdo je“).
  function autoStart(now) {
    const p = currentLesson(now);
    if (!p || relaceActive(now)) return;
    const hod = p.lesson.hodina;
    if (sameLesson(st.declined, now, hod) || sameLesson(st.volno, now, hod)) return;
    const e = scheduled(hod, now);
    if (!e) return;
    if (e.volno || !(e.tridy || []).length) {
      st.volno = { datum: dateKey(now), hodina: String(hod), rozvrh: true };
      saveState(st);
      return;
    }
    startRelace(e.tridy, hod, 'rozvrh', now);
  }

  function startRelace(tridy, hodina, puvod, now = new Date()) {
    const e = scheduled(hodina, now);
    const rel = {
      id: uid(), ucebna: roomId, tridy, hodina: String(hodina), zacatek: now.toISOString(), konec: null, spustil: user.email,
      puvod, rozvrhTridy: e && !e.volno ? e.tridy : [], zmenil: '', zmenaCas: null,
    };
    ctx.outbox.add('relace', rel);
    st.relace = { ...rel, datum: dateKey(now) };
    st.volno = null;
    remember(tridy, hodina, now);
    saveState(st);
  }

  // Učitel opravil třídu během hodiny: stejná hodina (zápisy zůstanou), jen jiné třídy.
  function changeRelace(tridy) {
    const now = new Date();
    const patch = { tridy, puvod: 'zmena', zmenil: user.email, zmenaCas: now.toISOString() };
    ctx.outbox.update('relace', st.relace.id, patch);
    Object.assign(st.relace, patch);
    remember(tridy, st.relace.hodina, now);
    saveState(st);
  }

  function remember(tridy, hodina, now) {
    st.historie = st.historie.filter((x) => !(x.datum === dateKey(now) && x.hodina === String(hodina)));
    st.historie.push({ datum: dateKey(now), wd: isoDay(now), hodina: String(hodina), tridy });
    st.historie = st.historie.slice(-80);
  }

  function screenKey(now) {
    if (relaceActive(now)) return `main|${st.relace.id}`;
    const p = isSchoolDay(now, ref.dnyBezProvozu) ? period(now, ref.zvoneni) : { type: 'free' };
    if (p.type === 'lesson') {
      if (sameLesson(st.volno, now, p.lesson.hodina)) return `volno|${p.lesson.hodina}|${st.volno.rozvrh ? 'r' : ''}`;
      return `select|${p.lesson.hodina}`;
    }
    if (p.type === 'break') return `break|${p.po}`;
    return `idle|${p.type}`;
  }

  // ---------- automatické uzavření ----------
  function autoClose(now) {
    let changed = false;
    const lessonOver = st.relace && !relaceActive(now);
    for (const v of [...st.venku]) {
      const out = (now - new Date(v.casOd)) / 60000;
      if (out >= autoMin || lessonOver) {
        const casDo = new Date(Math.min(now.getTime(), new Date(v.casOd).getTime() + autoMin * 60000)).toISOString();
        ctx.outbox.update('navstevy', v.navId, { casDo, autoUzavreno: true });
        st.venku = st.venku.filter((x) => x !== v);
        st.autoClosed.push({ zakId: v.zakId, at: now.toISOString(), casOd: v.casOd });
        changed = true;
      }
    }
    const before = st.autoClosed.length;
    st.autoClosed = st.autoClosed.filter((a) => now - new Date(a.at) < 10 * 60000);
    if (lessonOver) endRelace(now, false);
    if (changed || before !== st.autoClosed.length) { saveState(st); if (!lessonOver) drawOutStrip(now); }
  }

  function endRelace(now, redraw = true, byUser = false) {
    if (!st.relace) return;
    if (byUser && st.relace.hodina !== 'mimo') st.declined = { datum: dateKey(now), hodina: String(st.relace.hodina) };
    ctx.outbox.update('relace', st.relace.id, { konec: now.toISOString() });
    st.relace = null;
    saveState(st);
    if (redraw) { lastKey = null; tick(true); }
  }

  // ---------- obrazovky ----------
  function header(now, title, eyebrow, action) {
    clockEl = h('div', { class: 't-clock', 'aria-label': 'Čas' }, fmt.time(now));
    // Nastavení tabletu pro učitele/správce: otevře se až po podržení 2 s, ať ho žáci náhodou neotevřou.
    const gear = h('button', { class: 'gear', 'aria-label': 'Nastavení tabletu (podržet 2 sekundy)', title: 'Nastavení tabletu – podržet 2 s' },
      h('span', { class: 'ring' }));
    longPress(gear, 2000, openSettings);
    return h('div', { class: 't-head' },
      h('div', null, h('div', { class: 'eyebrow' }, eyebrow), h('h1', { class: 'title' }, title)),
      h('span', { class: 'spacer' }), action || null, clockEl, gear);
  }

  // Otevře obrazovku ručně a podrží ji, dokud se nezmění stav tabletu.
  function showManual(fn) {
    pinned = screenKey(new Date());
    lastKey = pinned;
    fn();
  }

  function draw(now) {
    const key = lastKey || screenKey(now);
    const [kind, arg, flag] = key.split('|');
    const r = room();
    if (kind === 'main') return drawMain(now);
    if (kind === 'select') return drawSelect(now, Number(arg));
    if (kind === 'volno') {
      return mount(el, header(now, 'Volná hodina', `${r.nazev} – ${arg}. hodina`),
        h('div', { class: 'state-screen' }, mark('opt', 'huge'),
          h('p', { class: 'sub' }, flag === 'r'
            ? 'Podle rozvrhu se tu teď neučí, odchody se nezapisují.'
            : 'Tuhle hodinu se odchody nezapisují. Tablet se probudí na další hodinu.'),
          h('button', { class: 'btn primary', onclick: () => {
            st.volno = null; st.declined = { datum: dateKey(now), hodina: String(arg) }; saveState(st);
            lastKey = null; tick(true);
          } }, 'Přece jen tu někdo je – vybrat třídu')));
    }
    if (kind === 'break') {
      const p = period(now, ref.zvoneni);
      const next = scheduled(p.next.hodina, now);
      return mount(el, header(now, 'Přestávka', r.nazev),
        h('div', { class: 'state-screen' }, mark('ok', 'huge'),
          h('p', { class: 'sub' }, `O přestávce se odchody nezapisují. ${p.next.hodina}. hodina začíná v ${fmt.time(atMin(now, p.next.od))}.`),
          next ? h('p', { class: 'rozvrh-next' }, 'Podle rozvrhu: ', h('b', null, rozvrhLabel(next)),
            next.volno ? '' : ' – hodina se spustí sama.') : null,
          h('button', { class: next && !next.volno ? 'btn' : 'btn primary', onclick: () => showManual(() => drawSelect(new Date(), p.next.hodina)) },
            next && !next.volno ? 'Přijde jiná třída' : `Vybrat třídu na ${p.next.hodina}. hodinu`)));
    }
    // mimo vyučování
    const free = !isSchoolDay(now, ref.dnyBezProvozu);
    return mount(el, header(now, free ? 'Dnes se neučí' : 'Mimo vyučování', r.nazev),
      h('div', { class: 'state-screen' }, mark('opt', 'huge'),
        h('p', { class: 'sub' }, free ? 'Dnes je den bez provozu.' : 'Odchody se zapisují jen během vyučovacích hodin.'),
        h('button', { class: 'btn', onclick: () => showManual(() => drawSelect(new Date(), 'mimo')) }, 'Začít mimořádnou hodinu')));
  }

  // ---- výběr třídy ----
  // change = učitel opravuje třídu v běžící hodině
  function drawSelect(now, hodina, { change = false } = {}) {
    const r = room();
    const wd = isoDay(now);
    const plan = scheduled(hodina, now);
    const pre = change ? st.relace.tridy : [];
    const selected = new Set(pre);
    const last = [...st.historie].reverse().find((x) => x.wd === wd && String(x.hodina) === String(hodina) && x.datum !== dateKey(now));
    const verb = change ? 'Uložit' : 'Začít hodinu';
    const startBtn = h('button', { class: 'btn primary', disabled: !selected.size, style: { minWidth: '220px' }, onclick: () => start([...selected]) },
      selected.size ? `${verb} – ${[...selected].join(' + ')}` : verb);
    const cnt = (t) => ref.zaci.filter((z) => z.aktivni !== false && z.trida === t).length;

    const tiles = new Map();
    const byGrade = new Map();
    for (const t of ref.tridy.filter((x) => x.aktivni !== false).sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'))) {
      if (!byGrade.has(t.rocnik)) byGrade.set(t.rocnik, []);
      byGrade.get(t.rocnik).push(t);
    }
    const toggle = (name) => {
      if (selected.has(name)) selected.delete(name); else selected.add(name);
      tiles.get(name).setAttribute('aria-pressed', selected.has(name));
      startBtn.disabled = selected.size === 0;
      startBtn.textContent = selected.size ? `${verb} – ${[...selected].join(' + ')}` : verb;
    };

    const hint = (label, tridy, btn) => h('div', { class: 'box fill', style: { marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' } },
      h('span', null, label, h('b', null, tridy.length ? tridy.join(' + ') : 'smíšená skupina')),
      h('button', { class: 'btn', onclick: () => start(tridy) }, btn));
    mount(el,
      header(now, change ? 'Kdo tu teď opravdu je?' : 'Kdo tu teď je?', `${r.nazev} – ${hodina === 'mimo' ? 'mimořádná hodina' : `${hodina}. hodina`}`,
        change ? h('button', { class: 'btn', onclick: () => { pinned = null; lastKey = null; tick(true); } }, 'Zpět – třída sedí') : null),
      h('p', { class: 'sub', style: { marginBottom: '16px' } }, change
        ? 'Vyber třídu, která tu opravdu je. Co už žáci v této hodině zapsali, zůstane uložené.'
        : 'Vyber třídu nebo dvě spojené. Žáci pak u sebe ťukají jméno, když odchází na toaletu.'),
      plan && !plan.volno && !change ? hint('Podle rozvrhu: ', plan.tridy, 'Podle rozvrhu') : null,
      !plan && last ? hint('Minulý týden tuhle hodinu: ', last.tridy, 'Stejná jako minule') : null,
      h('div', { class: 'grades' }, [...byGrade.entries()].map(([g, list]) => h('div', { class: 'grade-row' },
        h('div', { class: 'lbl' }, `${g}. roč.`),
        h('div', { class: 'class-grid' }, list.map((t) => {
          const b = h('button', { class: 'class-tile', 'aria-pressed': String(selected.has(t.nazev)), onclick: () => toggle(t.nazev) },
            h('span', null, t.nazev, h('span', { class: 'cnt' }, `${cnt(t.nazev)} žáků`)));
          tiles.set(t.nazev, b);
          return b;
        }))))),
      h('hr', { class: 'rule-thin' }),
      h('div', { class: 'btn-row' },
        startBtn,
        h('button', { class: 'btn', onclick: () => start([]) }, 'Smíšená skupina – žáky najdu jménem'),
        hodina !== 'mimo' && !change ? h('button', { class: 'btn ghost', onclick: () => { st.volno = { datum: dateKey(now), hodina: String(hodina) }; saveState(st); lastKey = null; tick(true); } }, 'Bez třídy – volno') : null));

    function start(tridy) {
      if (change) {
        changeRelace(tridy);
        toast(`Třída změněna na ${tridy.length ? tridy.join(' + ') : 'smíšenou skupinu'}.`);
      } else {
        startRelace(tridy, hodina, plan && !plan.volno && sameSet(plan.tridy, tridy) ? 'rozvrh' : 'ucitel');
      }
      lastKey = null;
      tick(true);
    }
  }

  // „Jiná třída“: když má učebna PIN, chce ho (ať třídu nemění žáci).
  async function askChange() {
    const r = room();
    if (r.pin && user.role === 'ucebna') {
      const p = await promptDialog('Změnu třídy potvrď PINem učebny', { type: 'password' });
      if (p === null) return;
      if (p !== String(r.pin)) { toast('Špatný PIN.'); return; }
    }
    showManual(() => drawSelect(new Date(), st.relace.hodina === 'mimo' ? 'mimo' : Number(st.relace.hodina), { change: true }));
  }

  // ---- hlavní obrazovka ----
  function drawMain(now) {
    const r = room();
    const rel = st.relace;
    const title = rel.tridy.length ? rel.tridy.join(' + ') : 'Smíšená skupina';
    outStripEl = h('div', { class: 'out-strip', 'aria-live': 'polite' });
    gridWrap = h('div');
    const search = h('input', { type: 'search', placeholder: 'Napiš příjmení…', 'aria-label': 'Hledat žáka podle příjmení', style: { maxWidth: '420px', minHeight: '56px', fontSize: '19px' } });
    const results = h('div', { class: 'student-grid', style: { marginTop: '10px' } });
    search.addEventListener('input', () => {
      const q = normalize(search.value);
      if (q.length < 2) { mount(results); return; }
      const hits = ref.zaci.filter((z) => z.aktivni !== false && (normalize(z.prijmeni).startsWith(q) || normalize(z.jmeno).startsWith(q))).slice(0, 12);
      mount(results, hits.length ? hits.map((z) => studentTile(z, true)) : h('p', { class: 'muted' }, 'Nikoho takového nevidím.'));
    });

    const sub = `${r.nazev} – ${rel.hodina === 'mimo' ? 'mimořádná hodina' : `${rel.hodina}. hodina`}${rel.puvod === 'rozvrh' ? ' – podle rozvrhu' : ''}${rel.puvod === 'zmena' ? ' – změněno učitelem' : ''}`;
    mount(el,
      header(now, title, sub, h('button', { class: 'btn change-btn', onclick: askChange }, 'Jiná třída')),
      outStripEl,
      gridWrap,
      h('hr', { class: 'rule-thin' }),
      h('label', { class: 'search-label' }, h('b', null, 'Nejsi v seznamu?'), ' Najdi se podle příjmení:'),
      h('div', null, search, results));
    drawOutStrip(now);
    drawGrid();
  }

  function drawGrid() {
    if (!gridWrap) return;
    const rel = st.relace;
    if (!rel) return;
    if (!rel.tridy.length) {
      mount(gridWrap, h('p', { class: 'sub' }, 'Smíšená skupina: najdi se dole podle příjmení.'));
      return;
    }
    mount(gridWrap, rel.tridy.map((t) => {
      const kids = ref.zaci.filter((z) => z.aktivni !== false && z.trida === t)
        .sort((a, b) => a.prijmeni.localeCompare(b.prijmeni, 'cs') || a.jmeno.localeCompare(b.jmeno, 'cs'));
      return h('section', { class: 'student-section' },
        rel.tridy.length > 1 ? h('h3', null, t) : null,
        h('div', { class: 'student-grid' }, kids.map((z) => studentTile(z, false))));
    }));
  }

  function studentTile(z, showClass) {
    const out = st.venku.some((v) => v.zakId === z.id);
    const full = !out && st.venku.length >= maxOut() && !override;
    return h('button', {
      class: ['student', out ? 'is-out' : ''], 'aria-disabled': full ? 'true' : null,
      onclick: () => (out ? askReturn(z) : askLeave(z)),
    }, h('b', null, z.prijmeni), h('span', null, showClass ? `${z.jmeno} – ${z.trida}` : z.jmeno));
  }

  function drawOutStrip(now) {
    if (!outStripEl) return;
    const items = [];
    for (const v of st.venku) {
      const z = zMap.get(v.zakId);
      const m = fmt.mins(v.casOd, now);
      items.push(h('button', { class: 'out-card', onclick: () => askReturn(z) },
        mark('wait'), h('span', null, `Venku: ${studentName(z, true)}`), h('span', { class: 'time' }, `${m} min`), h('span', { class: 'act' }, 'Jsem zpět')));
    }
    for (const a of st.autoClosed) {
      const z = zMap.get(a.zakId);
      items.push(h('div', { class: 'out-card auto' }, mark('opt'),
        h('span', null, `${studentName(z, true)} – nezapsal(a) návrat`), h('span', { class: 'time' }, `uzavřeno ${fmt.time(a.at)}`)));
    }
    if (!items.length) items.push(h('div', { class: 'empty' }, mark('ok'), h('span', null, 'Nikdo není venku. Kdo jde na toaletu, ťukne na své jméno.')));
    mount(outStripEl, items);
  }

  // ---- odchod ----
  function askLeave(z) {
    if (st.venku.length >= maxOut() && !override) {
      const names = st.venku.map((v) => studentName(zMap.get(v.zakId), true)).join(', ');
      return modal((close) => [
        h('div', { class: 'confirm-big' },
          mark('wait', 'big'),
          h('div', { class: 'who-big', style: { fontSize: '34px' } }, `Počkej, až se vrátí ${names}.`),
          h('p', { class: 'where' }, `Z této učebny může být venku ${maxOut() === 1 ? 'jen jeden žák' : `nejvýš ${maxOut()} žáci`}.`),
          h('div', { class: 'btn-row', style: { justifyContent: 'center' } },
            h('button', { class: 'btn primary', onclick: close }, 'Rozumím'),
            h('button', { class: 'btn ghost', onclick: () => { close(); override = true; askLeave(z); } }, 'Učitel povoluje výjimku'))),
      ]);
    }
    const r = room();
    const own = `${Number(r.patro) === 0 ? 'P' : r.patro}-${z.typWC}`;
    let chosen = ref.toalety.find((t) => t.id === own) ? own : ref.toalety.find((t) => t.typ === z.typWC)?.id;
    const wcs = [...ref.toalety.filter((t) => t.aktivni !== false)].sort((a, b) => (a.typ === z.typWC ? 0 : 1) - (b.typ === z.typWC ? 0 : 1) || a.patro - b.patro);
    let autoT = null;
    const close = modal((close) => {
      const where = h('p', { class: 'where wc-where' });
      const setWhere = () => { const t = ref.toalety.find((x) => x.id === chosen); mount(where, wcBadge(t, 'plain'), h('span', null, t ? t.nazev : '?')); };
      setWhere();
      const chips = h('div', { class: 'wc-choice' }, wcs.map((t) => {
        const b = h('button', { 'aria-pressed': String(t.id === chosen), onclick: () => {
          chosen = t.id; setWhere();
          chips.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
        } }, wcBadge(t, 'plain', 'sm'), t.nazev);
        return b;
      }));
      return [h('div', { class: 'confirm-big' },
        h('div', { class: 'eyebrow' }, 'Odcházíš na toaletu'),
        h('div', { class: 'who-big' }, `${z.jmeno} ${z.prijmeni}`),
        h('div', { class: 'muted' }, z.trida),
        where,
        h('div', { class: 'btn-row', style: { justifyContent: 'center' } },
          h('button', { class: 'btn primary', onclick: () => { close(); leave(z, chosen); } }, 'Jdu'),
          h('button', { class: 'btn', onclick: close }, 'Zpět – nejsem to já')),
        h('details', { style: { marginTop: '8px' } }, h('summary', { class: 'muted', style: { cursor: 'pointer' } }, 'Jdu na jinou toaletu'), chips))];
    }, { onClose: () => clearTimeout(autoT) });
    autoT = setTimeout(close, 20000);
  }

  function leave(z, toaleta) {
    const now = new Date();
    const nav = {
      id: uid(), zak: z.id, toaleta, casOd: now.toISOString(), casDo: null, zdroj: 'tablet',
      ucebna: roomId, relace: st.relace ? st.relace.id : '', zapsal: user.email, autoUzavreno: false, incident: '',
    };
    ctx.outbox.add('navstevy', nav);
    st.venku.push({ navId: nav.id, zakId: z.id, toaleta, casOd: nav.casOd });
    override = false;
    saveState(st);
    drawOutStrip(now); drawGrid();
    toast(`${studentName(z, true)} je venku. Až se vrátíš, ťukni na své jméno.`, { timeout: 3500 });
  }

  // ---- návrat ----
  function askReturn(z) {
    const v = st.venku.find((x) => x.zakId === z.id);
    if (!v) return;
    let autoT = null;
    const close = modal((close) => [h('div', { class: 'confirm-big' },
      mark('ok', 'big'),
      h('div', { class: 'who-big' }, `${z.jmeno}, jsi zpět?`),
      h('p', { class: 'where' }, `Venku ${fmt.mins(v.casOd, new Date())} min`),
      h('div', { class: 'btn-row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn primary', onclick: () => { close(); back(v, z); } }, 'Jsem zpět'),
        h('button', { class: 'btn', onclick: close }, 'Ještě ne')))], { onClose: () => clearTimeout(autoT) });
    autoT = setTimeout(close, 20000);
  }

  function back(v, z) {
    const now = new Date();
    ctx.outbox.update('navstevy', v.navId, { casDo: now.toISOString() });
    st.venku = st.venku.filter((x) => x !== v);
    saveState(st);
    drawOutStrip(now); drawGrid();
    toast(`Vítej zpět, ${z.jmeno}.`, { timeout: 2500 });
  }

  // ---- nastavení tabletu (dlouhý stisk) ----
  async function openSettings() {
    const r = room();
    if (r.pin && user.role === 'ucebna') {
      const p = await promptDialog('Zadej PIN učebny', { type: 'password' });
      if (p === null) return;
      if (p !== String(r.pin)) { toast('Špatný PIN.'); return; }
    }
    const now = new Date();
    modal((close) => [
      h('div', { class: 'eyebrow' }, `Nastavení tabletu – ${r.nazev}`),
      h('h2', { class: 'title' }, st.relace ? (st.relace.tridy.join(' + ') || 'Smíšená skupina') : 'Žádná hodina neběží'),
      h('hr', { class: 'rule' }),
      h('div', { class: 'stack' },
        st.relace ? h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', onclick: () => { close(); showManual(() => drawSelect(new Date(), st.relace.hodina === 'mimo' ? 'mimo' : Number(st.relace.hodina), { change: true })); } }, 'Změnit třídu'),
          h('button', { class: 'btn', onclick: () => { close(); endRelace(now, true, true); } }, 'Ukončit hodinu')) : null,
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: override || null, onchange: (e) => { override = e.target.checked; drawGrid(); } }),
          'Pustit dalšího žáka, i když je někdo venku (jen pro tuto chvíli)'),
        user.role !== 'ucebna' ? h('button', { class: 'btn', onclick: () => { close(); localStorage.removeItem(ADMIN_ROOM_KEY); ctx.navigate('#/trida'); } }, 'Změnit učebnu') : null,
        h('p', { class: 'muted small' }, 'Tip: na tabletu zapni režim jedné aplikace (Android: připnutí aplikace, iPad: Řízený přístup), ať se žáci nedostanou jinam.'),
        user.role === 'ucebna' ? h('button', { class: 'btn ghost', onclick: () => (ctx.demo ? (auth.demoLogout(), location.reload()) : auth.msLogout()) }, 'Odhlásit tablet') : null),
      h('div', { class: 'btn-row', style: { marginTop: '16px' } }, h('button', { class: 'btn ghost', onclick: close }, 'Zavřít')),
    ]);
  }

  // ---- výběr učebny (správce / vedení zkouší tablet) ----
  function chooseRoom() {
    clearInterval(timer);
    const byFloor = [0, 1, 2].map((p) => ({ p, rooms: ref.ucebny.filter((u) => Number(u.patro) === p && u.aktivni !== false) }));
    mount(el,
      h('div', { class: 'eyebrow' }, 'Tablet ve třídě'),
      h('h1', { class: 'title' }, 'Ve které učebně jsi?'),
      h('p', { class: 'sub' }, 'Tablet v učebně je přihlášený účtem učebny a vybírat nemusí. Ty si učebnu vybereš jednou, zařízení si ji zapamatuje.'),
      h('hr', { class: 'rule' }),
      byFloor.map(({ p, rooms }) => h('div', { class: 'grade-row' },
        h('div', { class: 'lbl' }, PATRA[p]),
        h('div', { class: 'class-grid' }, rooms.map((u) => h('button', { class: 'class-tile', style: { fontSize: '20px' }, onclick: () => {
          localStorage.setItem(ADMIN_ROOM_KEY, u.id);
          ctx.navigate('#/trida');
        } }, u.nazev))))));
  }
}

function sameSet(a, b) {
  const x = [...(a || [])].sort().join('|'), y = [...(b || [])].sort().join('|');
  return x === y;
}
