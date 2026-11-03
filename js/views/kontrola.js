// Kontrola toalety: dvě ťuknutí. „V pořádku“, nebo „Škoda“ s fotkou.

import { h, mount, mark, toast, uid, fmt, studentName } from '../ui.js';
import { findSlot, slotLabel, myDuties, startOfDay, addDays, minOfDay, hmStr } from '../time.js';
import { toiletStatus, computeWindow, visitsInWindow } from '../logic.js';
import { KATEGORIE, ZAVAZNOST, PATRA } from '../store/schema.js';
import { loadRange, compressImage } from '../data.js';
import { dozorNav, statusMark, legend, lastCheckText, wcName } from './common.js';

export async function render(el, ctx, r) {
  const kod = r.params[0];
  if (kod) return detail(el, ctx, kod, r.query.get('t'));
  return list(el, ctx);
}

// ---------- seznam toalet ----------
async function list(el, ctx) {
  const now = new Date();
  const ref = ctx.ref;
  mount(el, dozorNav(ctx, 'kontrola'), h('p', { class: 'muted' }, 'Načítám…'));
  const data = await loadRange(ctx, { from: addDays(startOfDay(now), -3), to: now });

  const duties = myDuties(ctx.user.email, now, ref);
  const m = minOfDay(now);
  const duty = duties.find((d) => m <= d.br.do + 10);

  const floors = [0, 1, 2].map((p) => {
    const wcs = ref.toalety.filter((t) => Number(t.patro) === p && t.aktivni !== false);
    return h('section', { class: 'floor' },
      h('h3', null, PATRA[p]),
      h('div', { class: 'row' }, wcs.map((t) => {
        const s = toiletStatus(t.id, data, now);
        const mine = duty && Number(duty.patro) === p;
        return h('a', { class: ['wc-tile', mine ? 'mine' : ''], href: `#/kontrola/${t.id}` },
          statusMark(s.state),
          h('span', null,
            h('span', { class: 't' }, t.typ === 'CH' ? 'Chlapci' : 'Dívky'), h('br'),
            h('span', { class: 's' }, lastCheckText(s.last, now)),
            s.open.length ? h('span', { class: 's' }, h('br'), `otevřené škody: ${s.open.length}`) : null));
      })));
  });

  mount(el,
    dozorNav(ctx, 'kontrola'),
    h('div', { class: 'eyebrow' }, 'Dozor a kontrola'),
    h('h1', { class: 'title' }, 'Kterou toaletu kontroluješ?'),
    h('p', { class: 'sub' }, 'Na dveřích je QR kód. Naskenuj ho fotoaparátem telefonu, nebo vyber toaletu tady.'),
    h('hr', { class: 'rule' }),
    duty ? h('div', { class: 'box fill', style: { marginBottom: '18px' } },
      h('h4', null, 'Tvůj dozor'),
      h('p', { style: { margin: 0 } }, h('b', null, `${PATRA[duty.patro]}, ${duty.prestavka}. přestávka`),
        ` (${hmStr(duty.br.od)}–${hmStr(duty.br.do)}). Na konci přestávky zkontroluj obě toalety na patře.`)) : null,
    h('div', { class: 'wc-list' }, floors),
    h('hr', { class: 'rule-thin' }),
    legend());
}

// ---------- detail toalety ----------
async function detail(el, ctx, kod, token) {
  const ref = ctx.ref;
  const t = ref.toalety.find((x) => x.id === kod);
  if (!t) {
    return mount(el, dozorNav(ctx, 'kontrola'), h('div', { class: 'state-screen' }, mark('wait', 'huge'),
      h('h1', { class: 'title' }, 'Tuhle toaletu neznám'),
      h('p', { class: 'sub' }, `Kód „${kod}“ v seznamu toalet není. QR kód je asi starý – vyber toaletu ze seznamu.`),
      h('a', { class: 'btn', href: '#/kontrola' }, 'Seznam toalet')));
  }
  let now = new Date();
  mount(el, dozorNav(ctx, 'kontrola'), h('p', { class: 'muted' }, 'Načítám…'));
  let data = await loadRange(ctx, { from: addDays(startOfDay(now), -3), to: now, toaleta: t.id });
  const s = toiletStatus(t.id, data, now);
  const slot = findSlot(now, t.id, ref);
  const oldQr = token && t.qrToken && token !== t.qrToken;

  const decide = h('div', { class: 'decide' },
    h('button', { class: 'ok', onclick: () => saveOk() }, mark('ok'), 'V pořádku'),
    h('button', { class: 'bad', onclick: () => damageForm() }, mark('bad'), 'Škoda'));

  mount(el,
    dozorNav(ctx, 'kontrola'),
    h('div', { class: 'eyebrow' }, `${PATRA[t.patro]} – kontrola`),
    h('h1', { class: 'title' }, t.nazev),
    h('p', { class: 'sub' }, slot ? `Patří ke kontrole: ${slotLabel(slot)}.` : 'Mimořádná kontrola (mimo rozpis).'),
    h('hr', { class: 'rule' }),
    oldQr ? h('div', { class: 'box dashed', style: { marginBottom: '12px' } }, 'Tenhle QR kód je ze starší sady. Kontrola se zapíše, ale dej vědět správci, ať vytiskne nové štítky.') : null,
    decide,
    h('div', { class: 'grid c2' },
      h('div', { class: 'box' }, h('h4', null, 'Poslední kontrola'), h('p', { style: { margin: 0 } }, statusMark(s.last ? (s.last.stav === 'ok' ? 'ok' : 'bad') : 'wait'), ' ', lastCheckText(s.last, now))),
      h('div', { class: 'box' }, h('h4', null, 'Od té doby'),
        h('p', { style: { margin: 0 } }, s.since === null ? 'Bez předchozí kontroly.' : `${s.since} ${fmt.plural(s.since, 'zapsaný odchod', 'zapsané odchody', 'zapsaných odchodů')} na tuto toaletu`))),
    s.open.length ? h('div', { class: 'box fill', style: { marginTop: '12px' } },
      h('h4', null, 'Už nahlášené a neuzavřené'),
      s.open.slice(-3).map((i) => h('p', { style: { margin: 0 } }, `${fmt.dt(i.casNalezu)} – ${KATEGORIE[i.kategorie] || i.kategorie}`)),
      h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, 'Pořád stejná škoda? Zapiš „Škoda“ a do poznámky dej „stále stejné“.')) : null,
    null);

  function kontrolaRecord(stav, poznamka = '') {
    now = new Date();
    const sl = findSlot(now, t.id, ref);
    return {
      id: uid(), toaleta: t.id, cas: now.toISOString(), stav, kontroloval: ctx.user.email, jmeno: ctx.user.name,
      role: ctx.user.role, slot: sl ? `${sl.prestavka}|${sl.typ}` : '', poznamka,
    };
  }

  async function saveOk() {
    decide.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const k = kontrolaRecord('ok');
    await ctx.outbox.add('kontroly', k);
    const other = ref.toalety.find((x) => Number(x.patro) === Number(t.patro) && x.id !== t.id && x.aktivni !== false);
    mount(el, dozorNav(ctx, 'kontrola'),
      h('div', { class: 'done-screen' },
        mark('ok'),
        h('h1', { class: 'title' }, 'V pořádku – zapsáno'),
        h('p', { class: 'sub' }, `${t.nazev}, ${fmt.time(k.cas)}. Díky.`),
        h('div', { class: 'btn-row', style: { justifyContent: 'center' } },
          other ? h('a', { class: 'btn primary', href: `#/kontrola/${other.id}` }, `Zkontrolovat i ${other.typ === 'CH' ? 'chlapce' : 'dívky'}`) : null,
          h('a', { class: 'btn', href: '#/kontrola' }, 'Seznam toalet'))));
  }

  // ---- formulář škody ----
  function damageForm() {
    let kat = null, zav = 2;
    const files = [];
    const katBtns = h('div', { class: 'cat-grid' }, Object.entries(KATEGORIE).map(([k, l]) => h('button', {
      'aria-pressed': 'false', onclick: (e) => {
        kat = k; katBtns.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        e.currentTarget.setAttribute('aria-pressed', 'true'); send.disabled = false;
      },
    }, l)));
    const zavBtns = h('div', { class: 'seg' }, Object.entries(ZAVAZNOST).map(([k, l]) => h('button', {
      'aria-pressed': String(Number(k) === zav), onclick: (e) => {
        zav = Number(k); zavBtns.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        e.currentTarget.setAttribute('aria-pressed', 'true');
      },
    }, l)));
    const popis = h('textarea', { placeholder: 'Krátce, co se stalo (nepovinné)', maxlength: '500' });
    const thumbs = h('div', { class: 'photos' });
    const fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true });
    fileInput.addEventListener('change', async () => {
      for (const f of fileInput.files) {
        const b = await compressImage(f);
        files.push(b);
        thumbs.insertBefore(h('img', { src: URL.createObjectURL(b), alt: `Fotka ${files.length}` }), addTile);
      }
      fileInput.value = '';
    });
    const addTile = h('label', { class: 'photo-add' }, fileInput, 'Vyfotit');
    thumbs.appendChild(addTile);
    const send = h('button', { class: 'btn dark', disabled: true, style: { minWidth: '220px', minHeight: '60px' }, onclick: () => submit() }, 'Nahlásit škodu');

    mount(el,
      dozorNav(ctx, 'kontrola'),
      h('div', { class: 'eyebrow' }, `${t.nazev} – škoda`),
      h('h1', { class: 'title' }, 'Co je špatně?'),
      h('hr', { class: 'rule' }),
      h('div', { class: 'stack' },
        h('div', null, h('h4', { class: 'eyebrow', style: { marginBottom: '8px' } }, 'Druh škody'), katBtns),
        h('div', null, h('h4', { class: 'eyebrow', style: { marginBottom: '8px' } }, 'Závažnost'), zavBtns),
        h('div', null, h('h4', { class: 'eyebrow', style: { marginBottom: '8px' } }, 'Fotky'), thumbs,
          h('p', { class: 'muted small', style: { marginTop: '6px' } }, 'Foť jen místnost a škodu, nikdy ne lidi.')),
        h('label', { class: 'field' }, h('span', null, 'Poznámka'), popis),
        h('div', { class: 'btn-row' }, send, h('a', { class: 'btn ghost', href: `#/kontrola/${t.id}` }, 'Zpět'))));

    async function submit() {
      send.disabled = true; send.textContent = 'Ukládám…';
      const k = kontrolaRecord('skoda', popis.value.trim());
      // čerstvá data pro okno (mohl mezitím někdo kontrolovat)
      data = await loadRange(ctx, { from: addDays(startOfDay(new Date()), -4), to: new Date(), toaleta: t.id }).catch(() => data);
      const w = computeWindow(data.kontroly, t.id, k.cas);
      const inc = {
        id: uid(), toaleta: t.id, casNalezu: k.cas, kategorie: kat, popis: popis.value.trim(), zavaznost: zav,
        oknoOd: w.od, siroke: w.siroke, nahlasil: ctx.user.email, jmeno: ctx.user.name, role: ctx.user.role,
        stav: 'novy', zaver: '', pocetFotek: files.length,
      };
      await ctx.outbox.add('kontroly', k);
      await ctx.outbox.add('incidenty', inc);
      // odchody v okně se označí, aby je noční mazání nesmazalo, dokud incident existuje
      for (const v of visitsInWindow(data.navstevy, t.id, w.od, k.cas)) {
        if (!v.incident) await ctx.outbox.update('navstevy', v.id, { incident: inc.id });
      }
      let i = 0;
      for (const f of files) { i++; await ctx.outbox.photo(inc.id, f, `foto-${i}.jpg`); }
      showResult(inc, w);
    }
  }

  // ---- po nahlášení: okno a kdo v něm byl ----
  function showResult(inc, w) {
    const visitors = visitsInWindow(data.navstevy, t.id, inc.oknoOd, inc.casNalezu);
    const zMap = new Map(ref.zaci.map((z) => [z.id, z]));
    const names = ctx.canSeeNames(inc.nahlasil);
    const winMin = fmt.mins(inc.oknoOd, inc.casNalezu);
    mount(el, dozorNav(ctx, 'kontrola'),
      h('div', { class: 'done-screen' }, mark('bad'),
        h('h1', { class: 'title' }, 'Škoda nahlášena'),
        h('p', { class: 'sub' }, `Vedení dostane upozornění. ${inc.pocetFotek ? `Fotky (${inc.pocetFotek}) se odesílají.` : ''}`)),
      h('div', { class: 'box' },
        h('h4', null, 'Okno incidentu'),
        h('p', null, h('b', null, `${fmt.time(inc.oknoOd)}–${fmt.time(inc.casNalezu)}`), ` (${fmt.dur(winMin)}) – od poslední kontroly do teď.`),
        w.siroke ? h('p', { class: 'note-strip' }, 'Dnes tu ještě nikdo nekontroloval, okno je proto široké a jména v něm málo vypovídají.') : null,
        h('p', null, visitors.length
          ? `V okně ${fmt.plural(visitors.length, 'je zapsaný', 'jsou zapsaní', 'je zapsáno')} ${visitors.length} ${fmt.plural(visitors.length, 'žák', 'žáci', 'žáků')}.`
          : 'V okně není zapsaný žádný odchod. Mohlo se to stát o přestávce.'),
        names && visitors.length ? h('div', { class: 'visitor-list' }, visitors.map((v) => {
          const z = zMap.get(v.zak);
          return h('div', { class: 'v' }, h('span', null, studentName(z)), h('span', { class: 'muted' }, z ? z.trida : ''),
            h('span', { class: 'nowrap' }, h('span', { class: 'num' }, fmt.time(v.casOd)), ' ', h('span', { class: 'muted small' }, v.zdroj === 'dozor' ? 'u dveří' : 'z hodiny')));
        })) : null,
        names && visitors.length ? h('p', { class: 'muted small', style: { marginTop: '10px' } }, 'Být v okně neznamená škodu způsobit. Jména slouží vedení k hledání opakujícího se vzorce.') : null),
      h('div', { class: 'btn-row', style: { marginTop: '18px' } },
        h('a', { class: 'btn primary', href: '#/kontrola' }, 'Hotovo')));
    toast('Škoda nahlášena.');
  }
}

export { wcName };
