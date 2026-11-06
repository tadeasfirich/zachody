// Testovací úložiště: všechno v IndexedDB tohoto prohlížeče, nic se nikam neposílá.
// Rozhraní je stejné jako u SharePointStore, takže zbytek aplikace nepozná rozdíl.
//
// Všechny testovací účty v jednom prohlížeči sdílí stejná data. Když máš otevřených víc záložek
// (třeba tablet a telefon vedle sebe), změna v jedné se přes BroadcastChannel hned projeví v ostatních.

import { idb } from './idb.js';
import { generateDemo, demoRozvrh } from './demo-data.js';
import { EVENT_KINDS, KINDS, buildSlotTemplate } from './schema.js';

const KEY = 'demo-db-v1';
const CHANNEL = 'zachody-demo';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i; // záznamy, které vznikly klikáním (ne vygenerované)

export class DemoStore {
  constructor() {
    this.db = null;
    this.simulateOffline = false;
    this.mode = 'demo';
    this.queue = Promise.resolve();
    this.listeners = new Set();
    this.bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
    if (this.bc) this.bc.onmessage = (e) => this._onRemote(e.data);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this._refresh([]); });
  }

  async init() {
    this.db = await idb.get('kv', KEY);
    if (!this.db) { await this.reset(); return; }
    // starší testovací data (před přidáním rozvrhu) doplníme, ať nemusíš nic mazat
    if (!this.db.ref.rozvrh) await this._mutate(['ref', 'rozvrh'], (db) => { db.ref.rozvrh = demoRozvrh(db.ref); });
  }

  // ---------- synchronizace mezi záložkami ----------
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  async _refresh(kinds) {
    const fresh = await idb.get('kv', KEY);
    if (fresh) this.db = fresh;
    for (const fn of this.listeners) fn({ kinds });
  }

  _onRemote(msg) {
    if (!msg) return;
    if (msg.type === 'reset') { location.reload(); return; }
    if (msg.type === 'changed') this._refresh(msg.kinds || []);
  }

  // Každý zápis: načti čerstvá data (mohla je změnit jiná záložka), uprav, ulož, dej vědět ostatním.
  _mutate(kinds, fn) {
    const run = async () => {
      const fresh = (await idb.get('kv', KEY)) || this.db;
      const res = fn(fresh);
      this.db = fresh;
      await idb.put('kv', fresh, KEY);
      if (this.bc) this.bc.postMessage({ type: 'changed', kinds });
      return res;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async reset() {
    this.db = generateDemo(new Date());
    this.db.ref.slotyKontrol = buildSlotTemplate(this.db.ref);
    await idb.put('kv', this.db, KEY);
    await this._clearPhotos();
    clearDeviceState();
    if (this.bc) this.bc.postMessage({ type: 'reset' });
  }

  // Smaže všechny záznamy (odchody, kontroly, incidenty), číselníky a žáky nechá.
  async clearEvents() {
    await this._mutate(EVENT_KINDS, (db) => { for (const k of EVENT_KINDS) db[k] = []; });
    await this._clearPhotos();
    clearDeviceState();
    if (this.bc) this.bc.postMessage({ type: 'reset' });
  }

  // Po posunu testovacího času do minulosti: vygenerované záznamy „z budoucnosti“ zmizí.
  // Co jsi naklikal sám, zůstává.
  async pruneFuture(now) {
    const t = new Date(now).getTime();
    await this._mutate(EVENT_KINDS, (db) => {
      for (const k of EVENT_KINDS) {
        const tf = KINDS[k].time;
        db[k] = db[k].filter((x) => UUID.test(x.id) || new Date(x[tf]).getTime() <= t);
      }
      for (const n of db.navstevy) if (n.casDo && new Date(n.casDo).getTime() > t && !UUID.test(n.id)) n.casDo = null;
    });
  }

  // Ostatní záložky se načtou znovu (změna času, obnova dat).
  broadcastReload() { if (this.bc) this.bc.postMessage({ type: 'reset' }); }

  async _clearPhotos() {
    const keys = await idb.keys('blobs');
    for (const k of keys) if (String(k).startsWith('demo-photo/')) await idb.del('blobs', k);
  }

  _check() {
    if (this.simulateOffline) {
      const e = new Error('Simulovaný výpadek sítě'); e.status = 0; throw e;
    }
  }

  // ---------- čtení ----------
  async getRef() { return structuredClone(this.db.ref); }

  async query(kind, { from, to, toaleta } = {}) {
    if (!EVENT_KINDS.includes(kind)) throw new Error(`Neznámý druh ${kind}`);
    const tf = KINDS[kind].time;
    const a = from ? new Date(from).getTime() : -Infinity;
    const b = to ? new Date(to).getTime() : Infinity;
    return this.db[kind]
      .filter((x) => { const t = new Date(x[tf]).getTime(); return t >= a && t <= b && (!toaleta || x.toaleta === toaleta); })
      .map((x) => ({ ...x }));
  }

  async get(kind, id) {
    const x = this.db[kind].find((y) => y.id === id);
    return x ? { ...x } : null;
  }

  // ---------- zápis ----------
  async saveRef(kind, value) {
    this._check();
    await this._mutate(['ref', kind], (db) => {
      db.ref[kind] = structuredClone(value);
      if (['zvoneni', 'planDozoru', 'rozpisKontrol', 'toalety', 'nastaveni'].includes(kind)) {
        db.ref.slotyKontrol = buildSlotTemplate(db.ref);
      }
    });
  }

  async add(kind, item) {
    this._check();
    await this._mutate([kind], (db) => {
      if (db[kind].some((x) => x.id === item.id)) return; // opakované odeslání z fronty
      db[kind].push({ ...item });
    });
  }

  async update(kind, id, patch) {
    this._check();
    const found = await this._mutate([kind], (db) => {
      const x = db[kind].find((y) => y.id === id);
      if (x) Object.assign(x, patch);
      return !!x;
    });
    if (!found) { const e = new Error('Záznam nenalezen'); e.status = 404; throw e; }
  }

  async remove(kind, id) {
    this._check();
    await this._mutate([kind], (db) => { db[kind] = db[kind].filter((x) => x.id !== id); });
  }

  async removeMany(kind, ids) {
    const set = new Set(ids);
    await this._mutate([kind], (db) => { db[kind] = db[kind].filter((x) => !set.has(x.id)); });
  }

  // ---------- fotky ----------
  async uploadPhoto(incidentId, blob, name) {
    this._check();
    await idb.put('blobs', blob, `demo-photo/${incidentId}/${name}`);
    if (this.bc) this.bc.postMessage({ type: 'changed', kinds: ['foto'] });
  }

  async listPhotos(incidentId) {
    const keys = await idb.keys('blobs');
    const out = [];
    for (const k of keys) {
      if (String(k).startsWith(`demo-photo/${incidentId}/`)) {
        const b = await idb.get('blobs', k);
        out.push({ name: String(k).split('/').pop(), url: URL.createObjectURL(b) });
      }
    }
    return out;
  }
}

// Stav tabletů a dozoru u dveří, který si drží zařízení (kdo je venku, naposledy zapsaní).
export function clearDeviceState() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('tablet-state') || k.startsWith('dozor-dvere')) localStorage.removeItem(k);
    }
  } catch { /* nic */ }
}
