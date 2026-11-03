// Jádro: „poslední čistý stav“, okna incidentů, překryv výskytů, plnění kontrol.
// Čisté funkce bez přístupu k úložišti – snadno se testují.

import { slotsForRange, schoolMinutes, startOfDay, addDays, dateKey } from './time.js';

const T = (v) => new Date(v).getTime();
const DEFAULT_VISIT_MIN = 5;

// Poslední kontrola (jakýkoli výsledek) před daným časem.
// Kontrola se škodou je také „známý stav“: nová škoda po ní je nová událost.
export function lastCheckBefore(kontroly, toaleta, time) {
  const t = T(time);
  let best = null;
  for (const k of kontroly) {
    if (k.toaleta !== toaleta) continue;
    const kt = T(k.cas);
    if (kt < t && (!best || kt > T(best.cas))) best = k;
  }
  return best;
}

// Okno incidentu: od poslední kontroly do nálezu.
// Bez kontroly téhož dne je okno „široké“ (od poslední kontroly vůbec, nejvýš 3 dny zpět).
export function computeWindow(kontroly, toaleta, casNalezu) {
  const last = lastCheckBefore(kontroly, toaleta, casNalezu);
  const dayStart = startOfDay(casNalezu);
  if (last && T(last.cas) >= dayStart.getTime()) {
    return { od: new Date(last.cas).toISOString(), siroke: false, kontrola: last };
  }
  const floor = addDays(dayStart, -3).getTime();
  const od = last ? Math.max(T(last.cas), floor) : dayStart.getTime();
  return { od: new Date(od).toISOString(), siroke: true, kontrola: last };
}

// Návštěvy, které se překrývají s oknem. Jeden žák = jeden řádek (nejdřívější).
export function visitsInWindow(navstevy, toaleta, od, doCas) {
  const a = T(od), b = T(doCas);
  const byZak = new Map();
  for (const n of navstevy) {
    if (n.toaleta !== toaleta) continue;
    const s = T(n.casOd);
    const e = n.casDo ? T(n.casDo) : s + DEFAULT_VISIT_MIN * 60000;
    if (s <= b && e >= a) {
      const prev = byZak.get(n.zak);
      if (!prev || s < T(prev.casOd)) byZak.set(n.zak, n);
    }
  }
  return [...byZak.values()].sort((x, y) => T(x.casOd) - T(y.casOd));
}

export function incidentVisitors(inc, navstevy) {
  return visitsInWindow(navstevy, inc.toaleta, inc.oknoOd, inc.casNalezu);
}

// ---------- analýza překryvu ----------
// Pozorováno (O): v kolika oknech incidentů se žák vyskytl.
// Očekáváno (E): kolikrát by se tam ocitl náhodou, podle toho, jak často na danou toaletu chodí.
// Nad očekávání = O − E. Díky E nejsou znevýhodnění žáci, kteří chodí často (např. ze zdravotních důvodů).
export function overlapAnalysis({ incidenty, navstevy, zaci, tridy, ref, from, to, patro = null }) {
  const zMap = new Map(zaci.map((z) => [z.id, z]));
  const toal = new Map(ref.toalety.map((t) => [t.id, t]));
  const incs = incidenty.filter((i) => patro === null || Number(toal.get(i.toaleta)?.patro) === Number(patro));
  const minutes = schoolMinutes(from, to, ref);

  // četnost návštěv žák × toaleta
  const visitCount = new Map();
  for (const n of navstevy) {
    const k = `${n.zak}|${n.toaleta}`;
    visitCount.set(k, (visitCount.get(k) || 0) + 1);
  }
  const prob = (zak, inc) => {
    const c = visitCount.get(`${zak}|${inc.toaleta}`) || 0;
    if (!c) return 0;
    const rate = c / minutes;
    const w = Math.max(1, (T(inc.casNalezu) - T(inc.oknoOd)) / 60000);
    return 1 - Math.exp(-rate * w);
  };

  const perIncident = incs.map((inc) => ({ inc, zaci: [...new Set(incidentVisitors(inc, navstevy).map((v) => v.zak))] }));

  // žáci
  const stats = new Map();
  const ensure = (id) => {
    if (!stats.has(id)) stats.set(id, { zak: id, O: 0, E: 0, N: 0, incidents: [] });
    return stats.get(id);
  };
  for (const { inc, zaci: ids } of perIncident) for (const id of ids) { const s = ensure(id); s.O++; s.incidents.push(inc.id); }
  for (const s of stats.values()) {
    const z = zMap.get(s.zak);
    for (const inc of incs) {
      s.E += prob(s.zak, inc);
      if (z && toal.get(inc.toaleta)?.typ === z.typWC) s.N++;
    }
  }
  const students = [...stats.values()]
    .filter((s) => s.O >= 2)
    .map((s) => ({ ...s, z: zMap.get(s.zak), excess: s.O - s.E }))
    .sort((a, b) => b.excess - a.excess || b.O - a.O);

  // dvojice a trojice, které sdílí okna
  const groupCount = (size) => {
    const m = new Map();
    for (const { inc, zaci: ids } of perIncident) {
      const sorted = [...ids].sort();
      combos(sorted, size, (combo) => {
        const k = combo.join('|');
        if (!m.has(k)) m.set(k, { ids: combo, O: 0, E: 0, incidents: [] });
        const g = m.get(k); g.O++; g.incidents.push(inc.id);
      });
    }
    const out = [...m.values()].filter((g) => g.O >= 2);
    for (const g of out) {
      g.E = incs.reduce((acc, inc) => acc + g.ids.reduce((p, id) => p * prob(id, inc), 1), 0);
      g.excess = g.O - g.E;
      g.members = g.ids.map((id) => zMap.get(id));
    }
    return out.sort((a, b) => b.excess - a.excess || b.O - a.O);
  };

  // třídy
  const cls = new Map();
  for (const s of stats.values()) {
    const tr = zMap.get(s.zak)?.trida || '?';
    if (!cls.has(tr)) cls.set(tr, { trida: tr, O: 0, E: 0, zaci: 0 });
    const c = cls.get(tr); c.O += s.O; c.E += s.E; c.zaci++;
  }
  const classes = [...cls.values()].map((c) => ({ ...c, excess: c.O - c.E })).sort((a, b) => b.excess - a.excess);

  return { incidents: incs.length, students, pairs: groupCount(2), triples: groupCount(3), classes, perIncident };
}

function combos(arr, k, cb, start = 0, acc = []) {
  if (acc.length === k) { cb(acc.slice()); return; }
  for (let i = start; i < arr.length; i++) { acc.push(arr[i]); combos(arr, k, cb, i + 1, acc); acc.pop(); }
}

// ---------- plnění kontrol ----------
// Stav slotu: done (splněno), missing (vynecháno), upcoming (teprve bude), running (právě běží), optional (nepovinný, neprovedený)
export function evaluateSlots(slots, kontroly, now = new Date()) {
  const used = new Set();
  const byWc = new Map();
  for (const k of kontroly) {
    if (!byWc.has(k.toaleta)) byWc.set(k.toaleta, []);
    byWc.get(k.toaleta).push(k);
  }
  for (const arr of byWc.values()) arr.sort((a, b) => T(a.cas) - T(b.cas));
  return slots.map((s) => {
    const arr = byWc.get(s.toaleta) || [];
    const hit = arr.find((k) => !used.has(k.id) && T(k.cas) >= s.od.getTime() && T(k.cas) <= s.do.getTime());
    if (hit) { used.add(hit.id); return { ...s, status: 'done', kontrola: hit }; }
    if (now < s.od) return { ...s, status: 'upcoming' };
    if (now <= s.do) return { ...s, status: 'running' };
    return { ...s, status: s.povinne ? 'missing' : 'optional' };
  });
}

export function compliance(from, to, ref, kontroly, now = new Date()) {
  const slots = evaluateSlots(slotsForRange(from, to, ref), kontroly, now).filter((s) => s.povinne && (s.status === 'done' || s.status === 'missing'));
  const per = new Map();
  for (const s of slots) {
    const k = s.ucitel || '(bez dozoru v plánu)';
    if (!per.has(k)) per.set(k, { ucitel: s.ucitel, jmeno: s.ucitelJmeno || 'Bez dozoru v plánu', expected: 0, done: 0, lastMissed: null, missed: [] });
    const p = per.get(k);
    p.expected++;
    if (s.status === 'done') p.done++;
    else { p.missed.push(s); if (!p.lastMissed || s.od > p.lastMissed) p.lastMissed = s.od; }
  }
  const people = [...per.values()].sort((a, b) => (a.done / a.expected) - (b.done / b.expected));
  const total = slots.length, done = slots.filter((s) => s.status === 'done').length;
  return { people, total, done, slots };
}

// ---------- stav toalety ----------
export function toiletStatus(toaleta, { kontroly, incidenty, navstevy }, now = new Date()) {
  const last = lastCheckBefore(kontroly, toaleta, now.getTime() + 1);
  const open = incidenty.filter((i) => i.toaleta === toaleta && i.stav !== 'uzavreno');
  const since = last ? navstevy.filter((n) => n.toaleta === toaleta && T(n.casOd) > T(last.cas)).length : null;
  const today = startOfDay(now).getTime();
  let state = 'wait';
  if (last && T(last.cas) >= today) state = last.stav === 'ok' ? 'ok' : 'bad';
  return { last, open, since, state };
}

// ---------- statistiky ----------
export function weeklyCounts(incidenty, from, to) {
  const weeks = [];
  let d = startOfDay(from);
  const wd = (d.getDay() + 6) % 7; d = addDays(d, -wd);
  for (; d <= to; d = addDays(d, 7)) weeks.push({ od: d, do: addDays(d, 7), n: 0 });
  for (const i of incidenty) {
    const w = weeks.find((x) => T(i.casNalezu) >= x.od.getTime() && T(i.casNalezu) < x.do.getTime());
    if (w) w.n++;
  }
  return weeks;
}

export function avgWindowMin(incidenty) {
  const ok = incidenty.filter((i) => !i.siroke);
  if (!ok.length) return null;
  return Math.round(ok.reduce((a, i) => a + (T(i.casNalezu) - T(i.oknoOd)) / 60000, 0) / ok.length);
}

export function daysBack(n, now = new Date()) {
  return { from: startOfDay(addDays(now, -n + 1)), to: now };
}

export { dateKey };
