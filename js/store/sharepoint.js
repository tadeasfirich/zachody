// Úložiště nad SharePoint seznamy přes Microsoft Graph.
// Každý seznam má ve sloupci Title ID položky z aplikace. Čtení číselníků se ukládá do mezipaměti
// zařízení, aby tablet naběhl i bez sítě.

import { CONFIG } from '../config.js';
import { KINDS, EVENT_KINDS, REF_KINDS, defaultRef, defaultSettings, buildSlotTemplate } from './schema.js';
import { idb } from './idb.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export class SharePointStore {
  constructor(getToken) {
    this.getToken = getToken; // async (scopes?) => accessToken
    this.siteId = null;
    this.spIds = new Map();   // `${kind}|${id}` → SharePoint item id
    this.mode = 'sharepoint';
  }

  // ---------- Graph ----------
  async graph(path, { method = 'GET', body, headers = {}, scopes, raw = false } = {}) {
    const token = await this.getToken(scopes);
    const url = path.startsWith('http') ? path : GRAPH + path;
    for (let attempt = 0; attempt < 4; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
          },
          body: body ? (body instanceof Blob ? body : JSON.stringify(body)) : undefined,
        });
      } catch (e) {
        const err = new Error('Nepodařilo se spojit se serverem'); err.status = 0; throw err;
      }
      if (res.status === 429 || res.status === 503) {
        const wait = Number(res.headers.get('Retry-After') || 2) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        let msg = `${res.status}`;
        try { const j = await res.json(); msg = j.error?.message || msg; } catch { /* nic */ }
        const err = new Error(`SharePoint: ${msg}`); err.status = res.status; throw err;
      }
      if (raw) return res;
      if (res.status === 204) return null;
      const ct = res.headers.get('content-type') || '';
      return ct.includes('json') ? res.json() : null;
    }
    const err = new Error('SharePoint je přetížený, zkus to za chvíli'); err.status = 429; throw err;
  }

  async init() {
    const cached = await idb.get('kv', 'sp-site-id');
    if (cached) this.siteId = cached;
    try {
      const s = await this.graph(`/sites/${CONFIG.sharepoint.hostname}:${CONFIG.sharepoint.sitePath}?$select=id`);
      this.siteId = s.id;
      await idb.put('kv', s.id, 'sp-site-id');
    } catch (e) {
      if (!this.siteId) throw e;
    }
  }

  listPath(kind) { return `/sites/${this.siteId}/lists/${encodeURIComponent(KINDS[kind].list)}`; }

  // ---------- převod polí ----------
  toApp(kind, item) {
    const f = item.fields || {};
    const out = { id: f.Title };
    for (const [app, sp, type] of KINDS[kind].fields) {
      let v = f[sp];
      if (type === 'number') v = v === undefined || v === null || v === '' ? null : Number(v);
      else if (type === 'boolean') v = v === true || v === 'true' || v === 1;
      else if (type === 'list') v = v ? String(v).split(';').filter(Boolean) : [];
      else if (v === undefined) v = type === 'dateTime' ? null : '';
      out[app] = v;
    }
    this.spIds.set(`${kind}|${out.id}`, item.id);
    return out;
  }

  toSp(kind, obj, partial = false) {
    const fields = partial ? {} : { Title: obj.id };
    for (const [app, sp, type] of KINDS[kind].fields) {
      if (!(app in obj)) continue;
      let v = obj[app];
      if (type === 'list') v = (v || []).join(';');
      else if (type === 'dateTime') v = v || null;
      else if (type === 'number') v = v === '' || v === null || v === undefined ? null : Number(v);
      else if (type === 'boolean') v = !!v;
      else v = v === null || v === undefined ? '' : String(v);
      fields[sp] = v;
    }
    return fields;
  }

  async listAll(kind, filter) {
    const sel = ['Title', ...KINDS[kind].fields.map((f) => f[1])].join(',');
    let url = `${this.listPath(kind)}/items?$expand=fields($select=${sel})&$top=999`;
    if (filter) url += `&$filter=${encodeURIComponent(filter)}`;
    const out = [];
    while (url) {
      const r = await this.graph(url, { headers: filter ? { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } : {} });
      for (const it of r.value) out.push(this.toApp(kind, it));
      url = r['@odata.nextLink'];
    }
    return out;
  }

  // ---------- číselníky ----------
  async getRef() {
    try {
      const ref = {};
      await Promise.all(REF_KINDS.map(async (k) => {
        const rows = await this.listAll(k);
        if (KINDS[k].kv) {
          ref[k] = { ...defaultSettings() };
          for (const r of rows) ref[k][r.id] = parseValue(r.hodnota);
        } else ref[k] = rows;
      }));
      const def = defaultRef();
      if (!ref.zvoneni.length) ref.zvoneni = def.zvoneni;
      if (!ref.rozpisKontrol.length) ref.rozpisKontrol = def.rozpisKontrol;
      if (!ref.toalety.length) ref.toalety = def.toalety;
      await idb.put('kv', ref, 'sp-ref-cache');
      return ref;
    } catch (e) {
      const cached = await idb.get('kv', 'sp-ref-cache');
      if (cached) return cached;
      throw e;
    }
  }

  async saveRef(kind, value) {
    if (KINDS[kind].kv) {
      const existing = await this.listAll(kind);
      for (const [k, v] of Object.entries(value)) {
        const ex = existing.find((x) => x.id === k);
        const hodnota = JSON.stringify(v);
        if (ex) { if (ex.hodnota !== hodnota) await this.update(kind, k, { hodnota }); }
        else await this.add(kind, { id: k, hodnota });
      }
    } else {
      const existing = await this.listAll(kind);
      const want = new Map(value.map((x) => [x.id, x]));
      for (const ex of existing) if (!want.has(ex.id)) await this.remove(kind, ex.id);
      for (const item of value) {
        const ex = existing.find((x) => x.id === item.id);
        if (!ex) await this.add(kind, item);
        else if (changed(kind, ex, item)) await this.update(kind, item.id, item);
      }
    }
    if (['zvoneni', 'planDozoru', 'rozpisKontrol', 'toalety', 'nastaveni'].includes(kind)) {
      const ref = await this.getRef();
      await this.saveDerivedSlots(ref);
    }
  }

  async saveDerivedSlots(ref) {
    const tpl = buildSlotTemplate(ref);
    const existing = await this.listAll('slotyKontrol');
    const want = new Map(tpl.map((x) => [x.id, x]));
    for (const ex of existing) if (!want.has(ex.id)) await this.remove('slotyKontrol', ex.id);
    for (const t of tpl) {
      const ex = existing.find((x) => x.id === t.id);
      if (!ex) await this.add('slotyKontrol', t);
      else if (changed('slotyKontrol', ex, t)) await this.update('slotyKontrol', t.id, t);
    }
  }

  // ---------- události ----------
  async query(kind, { from, to, toaleta } = {}) {
    if (!EVENT_KINDS.includes(kind)) throw new Error(`Neznámý druh ${kind}`);
    const tf = KINDS[kind].fields.find((f) => f[0] === KINDS[kind].time)[1];
    const parts = [];
    if (from) parts.push(`fields/${tf} ge '${new Date(from).toISOString()}'`);
    if (to) parts.push(`fields/${tf} le '${new Date(to).toISOString()}'`);
    if (toaleta) parts.push(`fields/Toaleta eq '${toaleta.replace(/'/g, "''")}'`);
    return this.listAll(kind, parts.join(' and ') || undefined);
  }

  async get(kind, id) {
    const r = await this.listAll(kind, `fields/Title eq '${id}'`);
    return r[0] || null;
  }

  async spId(kind, id) {
    const k = `${kind}|${id}`;
    if (this.spIds.has(k)) return this.spIds.get(k);
    const st = await idb.get('kv', `spid|${k}`);
    if (st) { this.spIds.set(k, st); return st; }
    const r = await this.listAll(kind, `fields/Title eq '${id}'`);
    if (!r.length) { const e = new Error('Záznam v SharePointu nenalezen'); e.status = 404; throw e; }
    return this.spIds.get(k);
  }

  async add(kind, item) {
    // ochrana proti dvojímu zápisu při opakovaném odeslání z fronty
    if (EVENT_KINDS.includes(kind)) {
      const ex = await this.listAll(kind, `fields/Title eq '${item.id}'`).catch(() => []);
      if (ex.length) return;
    }
    const r = await this.graph(`${this.listPath(kind)}/items`, { method: 'POST', body: { fields: this.toSp(kind, item) } });
    this.spIds.set(`${kind}|${item.id}`, r.id);
    await idb.put('kv', r.id, `spid|${kind}|${item.id}`);
  }

  async update(kind, id, patch) {
    const sid = await this.spId(kind, id);
    await this.graph(`${this.listPath(kind)}/items/${sid}/fields`, { method: 'PATCH', body: this.toSp(kind, patch, true) });
  }

  async remove(kind, id) {
    let sid;
    try { sid = await this.spId(kind, id); } catch (e) { if (e.status === 404) return; throw e; }
    await this.graph(`${this.listPath(kind)}/items/${sid}`, { method: 'DELETE' });
    this.spIds.delete(`${kind}|${id}`);
    await idb.del('kv', `spid|${kind}|${id}`);
  }

  async removeMany(kind, ids) {
    for (const id of ids) await this.remove(kind, id);
  }

  // ---------- fotky ----------
  photoPath(incidentId, name = '') {
    const base = `${CONFIG.sharepoint.photoFolder}/${incidentId}`;
    return name ? `${base}/${name}` : base;
  }

  async uploadPhoto(incidentId, blob, name) {
    await this.graph(`/sites/${this.siteId}/drive/root:/${encodeURI(this.photoPath(incidentId, name))}:/content`, {
      method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' },
    });
  }

  async listPhotos(incidentId) {
    try {
      const r = await this.graph(`/sites/${this.siteId}/drive/root:/${encodeURI(this.photoPath(incidentId))}:/children?$select=name,@microsoft.graph.downloadUrl,webUrl`);
      return r.value.map((x) => ({ name: x.name, url: x['@microsoft.graph.downloadUrl'], webUrl: x.webUrl }));
    } catch (e) {
      if (e.status === 404) return [];
      throw e;
    }
  }

  // ---------- instalace (jednorázově, správce) ----------
  async install(log) {
    const scopes = [...CONFIG.scopes, ...CONFIG.installScopes];
    const lists = await this.graph(`/sites/${this.siteId}/lists?$select=id,displayName&$top=200`, { scopes });
    const have = new Map(lists.value.map((l) => [l.displayName, l.id]));
    for (const [kind, def] of Object.entries(KINDS)) {
      const columns = def.fields.map(([, sp, type, indexed]) => colDef(sp, type, indexed));
      if (!have.has(def.list)) {
        log(`Zakládám seznam ${def.list}…`);
        await this.graph(`/sites/${this.siteId}/lists`, {
          method: 'POST', scopes,
          body: { displayName: def.list, columns, list: { template: 'genericList' } },
        });
      } else {
        const listId = have.get(def.list);
        const cols = await this.graph(`/sites/${this.siteId}/lists/${listId}/columns?$select=name`, { scopes });
        const names = new Set(cols.value.map((c) => c.name));
        for (const c of columns) {
          if (!names.has(c.name)) {
            log(`Přidávám sloupec ${def.list}.${c.name}`);
            await this.graph(`/sites/${this.siteId}/lists/${listId}/columns`, { method: 'POST', body: c, scopes });
          }
        }
        log(`Seznam ${def.list} je v pořádku.`);
      }
    }
    // Title jako index (vyhledávání podle ID)
    log('Doplňuji výchozí hodnoty…');
    const def = defaultRef();
    for (const k of ['toalety', 'zvoneni', 'rozpisKontrol']) {
      const rows = await this.listAll(k);
      if (!rows.length) { for (const r of def[k]) await this.add(k, r); log(`Výchozí ${KINDS[k].list}: ${def[k].length} řádků`); }
    }
    const nast = await this.listAll('nastaveni');
    if (!nast.length) for (const [k, v] of Object.entries(def.nastaveni)) await this.add('nastaveni', { id: k, hodnota: JSON.stringify(v) });
    const ref = await this.getRef();
    await this.saveDerivedSlots(ref);
    log('Hotovo.');
  }
}

function colDef(name, type, indexed) {
  const c = { name, enforceUniqueValues: false, indexed: !!indexed };
  if (type === 'number') c.number = {};
  else if (type === 'boolean') c.boolean = {};
  else if (type === 'dateTime') c.dateTime = { format: 'dateTime' };
  else if (type === 'note') c.text = { allowMultipleLines: true };
  else c.text = { maxLength: 255 };
  return c;
}

function parseValue(v) {
  try { return JSON.parse(v); } catch { return v; }
}

function changed(kind, a, b) {
  for (const [app, , type] of KINDS[kind].fields) {
    const x = a[app], y = b[app];
    if (type === 'list') { if ((x || []).join(';') !== (y || []).join(';')) return true; }
    else if (type === 'number') { if (Number(x ?? 0) !== Number(y ?? 0)) return true; }
    else if (type === 'boolean') { if (!!x !== !!y) return true; }
    else if (String(x ?? '') !== String(y ?? '')) return true;
  }
  return false;
}
