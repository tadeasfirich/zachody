// Fronta zápisů. Každý zápis (odchod žáka, kontrola, incident, fotka) se nejdřív uloží
// do zařízení a teprve potom odešle. Při výpadku sítě aplikace běží dál a zkouší to znovu.

import { idb } from './idb.js';

export class Outbox {
  constructor(store) {
    this.store = store;
    this.flushing = null;
    this.listeners = new Set();
    this.lastError = null;
    window.addEventListener('online', () => this.flush());
    setInterval(() => this.flush(), 20000);
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  async emit() { const n = await this.count(); for (const fn of this.listeners) fn(n, this.lastError); }
  count() { return idb.count('outbox'); }

  // op: { kind, action: 'add'|'update'|'remove'|'photo', id, data, blobKey, name }
  async enqueue(op) {
    await idb.put('outbox', { ...op, created: new Date().toISOString(), tries: 0 });
    await this.emit();
    this.flush();
  }

  add(kind, data) { return this.enqueue({ kind, action: 'add', id: data.id, data }); }
  update(kind, id, data) { return this.enqueue({ kind, action: 'update', id, data }); }
  remove(kind, id) { return this.enqueue({ kind, action: 'remove', id }); }

  async photo(incidentId, blob, name) {
    const blobKey = `${incidentId}/${name}`;
    await idb.put('blobs', blob, blobKey);
    return this.enqueue({ kind: 'foto', action: 'photo', id: incidentId, blobKey, name });
  }

  flush() {
    if (this.flushing) return this.flushing;
    this.flushing = this._flush().finally(() => { this.flushing = null; this.emit(); });
    return this.flushing;
  }

  async _flush() {
    if (navigator.onLine === false) return;
    const ops = (await idb.all('outbox')).sort((a, b) => a.seq - b.seq);
    for (const op of ops) {
      try {
        await this.apply(op);
        await idb.del('outbox', op.seq);
        if (op.blobKey) await idb.del('blobs', op.blobKey);
        this.lastError = null;
      } catch (e) {
        if (isPermanent(e)) {
          // Trvalá chyba (např. smazaná položka): záznam odložíme stranou, ať neblokuje frontu.
          console.warn('Zápis se nepodařil a byl odložen', op, e);
          await idb.put('kv', { op, error: String(e.message || e), at: new Date().toISOString() }, `failed-${op.seq}`);
          await idb.del('outbox', op.seq);
          continue;
        }
        this.lastError = e.message || String(e);
        return; // síť nebo server: zkusíme později, pořadí zachováme
      }
    }
  }

  async apply(op) {
    const s = this.store;
    if (op.action === 'add') return s.add(op.kind, op.data);
    if (op.action === 'update') return s.update(op.kind, op.id, op.data);
    if (op.action === 'remove') return s.remove(op.kind, op.id);
    if (op.action === 'photo') {
      const blob = await idb.get('blobs', op.blobKey);
      if (!blob) return;
      return s.uploadPhoto(op.id, blob, op.name);
    }
  }

  // Fotky, které ještě čekají na odeslání (aby je šlo hned zobrazit).
  async pendingPhotos(incidentId) {
    const ops = await idb.all('outbox');
    const out = [];
    for (const op of ops) {
      if (op.action === 'photo' && op.id === incidentId) {
        const b = await idb.get('blobs', op.blobKey);
        if (b) out.push({ name: op.name, url: URL.createObjectURL(b), pending: true });
      }
    }
    return out;
  }
}

function isPermanent(e) {
  const st = e && e.status;
  return st && st >= 400 && st < 500 && st !== 401 && st !== 403 && st !== 408 && st !== 429;
}
