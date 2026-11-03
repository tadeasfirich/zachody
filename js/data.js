// Společné načítání dat pro obrazovky. Před čtením odešleme čekající zápisy, ať je vidět i to, co se právě zapsalo.

import { startOfDay, addDays } from './time.js';

export async function loadRange(ctx, { from, to = new Date(), kinds = ['kontroly', 'incidenty', 'navstevy'], toaleta } = {}) {
  try { await ctx.outbox.flush(); } catch { /* offline – nevadí */ }
  const out = {};
  await Promise.all(kinds.map(async (k) => { out[k] = await ctx.store.query(k, { from, to, toaleta }); }));
  return out;
}

export function lastDays(n, now = new Date()) {
  return { from: startOfDay(addDays(now, -n + 1)), to: now };
}

// Zmenší fotku na max 1600 px a uloží jako JPEG 0,8.
export async function compressImage(file, max = 1600, quality = 0.8) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), hh = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  c.getContext('2d').drawImage(bmp, 0, 0, w, hh);
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', quality));
}

export async function photosOf(ctx, incidentId) {
  const pending = await ctx.outbox.pendingPhotos(incidentId);
  let stored = [];
  try { stored = await ctx.store.listPhotos(incidentId); } catch { /* offline */ }
  return [...stored, ...pending];
}
