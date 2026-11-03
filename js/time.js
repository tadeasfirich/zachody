// Rozvrh zvonění, přestávky a sloty kontrol.
// Všechno počítáme v místním čase zařízení (ve škole Europe/Prague), ukládáme v ISO (UTC).

export const TYP_SLOTU = {
  'konec-hodiny': 'na začátku přestávky',
  'konec-prestavky': 'na konci přestávky',
};

export const pad = (n) => String(n).padStart(2, '0');

export function hm(s) {
  const [a, b] = String(s).split(':').map(Number);
  return a * 60 + (b || 0);
}

export function hmStr(min) {
  return `${Math.floor(min / 60)}:${pad(min % 60)}`;
}

export function atMin(date, min) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(min);
  return d;
}

export function dateKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function minOfDay(d) { const x = new Date(d); return x.getHours() * 60 + x.getMinutes() + x.getSeconds() / 60; }

// ISO den v týdnu: 1 = pondělí … 7 = neděle
export function isoDay(d) { const g = new Date(d).getDay(); return g === 0 ? 7 : g; }

export function lessons(zvoneni) {
  return [...zvoneni]
    .map((z) => ({ hodina: Number(z.hodina), od: hm(z.zacatek), do: hm(z.konec) }))
    .sort((a, b) => a.od - b.od);
}

// Přestávka „po N. hodině“ = mezi hodinou N a následující.
export function breaks(zvoneni) {
  const L = lessons(zvoneni);
  const out = [];
  for (let i = 0; i < L.length - 1; i++) {
    out.push({ po: L[i].hodina, dalsi: L[i + 1].hodina, od: L[i].do, do: L[i + 1].od });
  }
  return out;
}

export function isSchoolDay(d, dnyBezProvozu = []) {
  const wd = isoDay(d);
  if (wd > 5) return false;
  const k = dateKey(d);
  return !dnyBezProvozu.some((x) => x.datum === k);
}

// Co se teď děje: hodina, přestávka, před vyučováním, po vyučování.
export function period(now, zvoneni) {
  const L = lessons(zvoneni);
  const m = minOfDay(now);
  if (!L.length) return { type: 'none' };
  if (m < L[0].od) return { type: 'before', next: L[0] };
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (m >= l.od && m < l.do) return { type: 'lesson', lesson: l, endsIn: l.do - m };
    const n = L[i + 1];
    if (n && m >= l.do && m < n.od) return { type: 'break', po: l.hodina, next: n, endsIn: n.od - m };
  }
  return { type: 'after' };
}

export function slotLabel(s) {
  return `${s.prestavka}. přestávka – ${TYP_SLOTU[s.typ]}`;
}

// Okno slotu v minutách dne.
export function slotRange(br, typ, tolerance) {
  if (typ === 'konec-hodiny') return [br.od - 5, br.od + 3 + tolerance];
  return [br.do - 3, br.do + 5 + tolerance];
}

// Očekávané kontroly pro jeden den: každá toaleta × každý záznam rozpisu.
export function slotsForDay(day, ref) {
  if (!isSchoolDay(day, ref.dnyBezProvozu)) return [];
  const tol = Number(ref.nastaveni.toleranceMin ?? 5);
  const br = breaks(ref.zvoneni);
  const wd = isoDay(day);
  const dk = dateKey(day);
  const out = [];
  for (const r of ref.rozpisKontrol) {
    if (r.rezim !== 'povinne' && r.rezim !== 'nepovinne') continue;
    const b = br.find((x) => x.po === Number(r.prestavka));
    if (!b) continue;
    const [a, z] = slotRange(b, r.typ, tol);
    for (const t of ref.toalety.filter((x) => x.aktivni !== false)) {
      const dozor = ref.planDozoru.find((p) => Number(p.den) === wd && Number(p.prestavka) === b.po && Number(p.patro) === Number(t.patro));
      out.push({
        key: `${dk}|${t.id}|${b.po}|${r.typ}`,
        datum: dk,
        toaleta: t.id,
        patro: Number(t.patro),
        prestavka: b.po,
        typ: r.typ,
        povinne: r.rezim === 'povinne',
        od: atMin(day, a),
        do: atMin(day, z),
        ucitel: dozor ? dozor.ucitel : null,
        ucitelJmeno: dozor ? dozor.jmeno : null,
      });
    }
  }
  return out.sort((x, y) => x.od - y.od || x.toaleta.localeCompare(y.toaleta));
}

export function slotsForRange(from, to, ref) {
  const out = [];
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) out.push(...slotsForDay(d, ref));
  return out;
}

// Ke kterému slotu kontrola patří (povinné mají přednost).
export function findSlot(time, toaletaId, ref) {
  const t = new Date(time);
  const cands = slotsForDay(t, ref).filter((s) => s.toaleta === toaletaId && t >= s.od && t <= s.do);
  cands.sort((a, b) => Number(b.povinne) - Number(a.povinne));
  return cands[0] || null;
}

// Školní minuty v období (pro odhad, jak často žák chodí).
export function schoolMinutes(from, to, ref) {
  const L = lessons(ref.zvoneni);
  if (!L.length) return 1;
  const span = L[L.length - 1].do - L[0].od;
  let n = 0;
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) if (isSchoolDay(d, ref.dnyBezProvozu)) n++;
  return Math.max(1, n * span);
}

// Dozor daného učitele právě teď (nebo nejbližší dnes).
export function myDuties(email, day, ref) {
  if (!email) return [];
  const wd = isoDay(day);
  const br = breaks(ref.zvoneni);
  const e = email.toLowerCase();
  return ref.planDozoru
    .filter((p) => Number(p.den) === wd && String(p.ucitel || '').toLowerCase() === e)
    .map((p) => ({ ...p, br: br.find((b) => b.po === Number(p.prestavka)) }))
    .filter((p) => p.br)
    .sort((a, b) => a.br.od - b.br.od);
}
