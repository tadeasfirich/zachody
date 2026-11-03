// Start aplikace: přihlášení, načtení dat, hlavička s přepínačem aplikací a směrování.

import { CONFIG, isDemo } from './config.js';
import { h, mount, mark, toast, modal } from './ui.js';
import * as auth from './auth.js';
import { DemoStore } from './store/demo.js';
import { SharePointStore } from './store/sharepoint.js';
import { Outbox } from './store/outbox.js';
import * as testing from './demo-panel.js';

const root = document.getElementById('app');
const demo = isDemo();

const ROUTES = {
  trida: { app: 'trida', load: () => import('./views/trida.js') },
  kontrola: { app: 'dozor', load: () => import('./views/kontrola.js') },
  dozor: { app: 'dozor', load: () => import('./views/dozor.js') },
  dnes: { app: 'dozor', load: () => import('./views/dnes.js') },
  sprava: { app: 'sprava', load: () => import('./views/sprava.js') },
};

const ctx = {
  demo,
  store: null,
  outbox: null,
  user: null,
  ref: null,
  async reloadRef() { ctx.ref = await ctx.store.getRef(); return ctx.ref; },
  navigate(hash) { if (location.hash === hash) route(); else location.hash = hash; },
  canSeeNames(reporterEmail) {
    const r = ctx.user.role;
    if (r === 'spravce' || r === 'vedeni') return true;
    if (r === 'uklid') return !!ctx.ref.nastaveni.jmenaVidiUklid;
    if (r === 'ucitel') return ctx.ref.nastaveni.jmenaVidiUcitel !== false && (!reporterEmail || reporterEmail === ctx.user.email);
    return false;
  },
  isAdmin() { return ctx.user.role === 'spravce'; },
  canManage() { return ctx.user.role === 'spravce' || ctx.user.role === 'vedeni'; },
};
window.__ctx = ctx; // pro ladění v konzoli

let cleanup = null;
let outboxCount = 0;
let current = null; // aktuální trasa (pro obnovu po změně z jiné záložky)

boot().catch((e) => {
  console.error(e);
  mount(root, h('div', { class: 'login' }, h('div', { class: 'login-card' },
    h('div', { class: 'eyebrow' }, 'Chyba při spuštění'),
    h('h1', { class: 'title' }, 'Aplikace se nespustila'),
    h('p', null, e.message || String(e)),
    h('p', { class: 'muted small' }, 'Zkontroluj připojení k internetu a obnov stránku. Když to přetrvá, napiš správci.'),
    h('button', { class: 'btn', onclick: () => location.reload() }, 'Obnovit stránku'))));
});

async function boot() {
  registerSW();
  if (demo) {
    // ?as=email otevře záložku rovnou za daný testovací účet
    const as = new URLSearchParams(location.search).get('as');
    if (as) {
      const u = auth.DEMO_USERS.find((x) => x.email === as);
      if (u) auth.demoLogin(u);
      history.replaceState(null, '', location.pathname + location.hash);
    }
    ctx.store = new DemoStore();
    await ctx.store.init();
    const u = auth.demoUser();
    if (!u) { ctx.ref = await ctx.store.getRef(); return showDemoLogin(); }
    ctx.user = { ...u };
    ctx.store.onChange(onRemoteChange);
  } else {
    // testovací čas v ostrém provozu nikdy
    if (localStorage.getItem('zachody-demo-clock')) { localStorage.removeItem('zachody-demo-clock'); location.reload(); return; }
    let account = null;
    try { account = await auth.msInit(); } catch (e) { console.error(e); }
    if (!account) return showMsLogin();
    const store = new SharePointStore(auth.getToken);
    ctx.store = store;
    let u;
    try { u = await auth.msUser(); localStorage.setItem('ms-user-cache', JSON.stringify(u)); }
    catch (e) {
      // offline: použij poslední známou roli
      u = JSON.parse(localStorage.getItem('ms-user-cache') || 'null');
      if (!u) throw e;
    }
    ctx.user = u;
    if (!u.role) return showNoAccess(u);
    await store.init();
    const back = auth.takeReturnHash();
    if (back) history.replaceState(null, '', back);
  }
  ctx.outbox = new Outbox(ctx.store);
  ctx.outbox.onChange((n) => { outboxCount = n; updateOutboxPill(); });
  await ctx.reloadRef();
  if (ctx.user.role === 'ucebna' && !ctx.user.ucebna) {
    const u = ctx.ref.ucebny.find((x) => String(x.ucet).toLowerCase() === ctx.user.email);
    ctx.user.ucebna = u ? u.id : null;
  }
  window.addEventListener('hashchange', route);
  route();
  ctx.outbox.flush();
}

// ---------- přihlašovací obrazovky ----------
function loginShell(...children) {
  mount(root, h('main', { class: 'login' }, h('div', { class: 'login-card' },
    h('div', { class: 'shapes' }, mark('ok'), mark('bad')),
    h('div', { class: 'eyebrow' }, CONFIG.schoolName),
    h('h1', { class: 'title' }, CONFIG.appName),
    ...children)));
}

function showMsLogin() {
  loginShell(
    h('p', { class: 'sub' }, 'Kontroly toalet, odchody žáků z hodin a přehled škod. Přihlas se školním účtem.'),
    h('hr', { class: 'rule' }),
    h('button', { class: 'btn primary ms-btn', onclick: () => auth.msLogin() },
      h('span', { class: 'ms-logo', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
      'Přihlásit přes Microsoft'),
    h('p', { class: 'muted small', style: { marginTop: '14px' } }, 'Co uvidíš, záleží na tom, do které skupiny tě správce zařadil.'));
}

function showNoAccess(u) {
  loginShell(
    h('hr', { class: 'rule' }),
    h('p', { style: { fontSize: '20px' } }, h('b', null, 'Nemáš přístup.')),
    h('p', null, `Účet ${u.email} není v žádné skupině aplikace. Napiš správci, ať tě zařadí.`),
    h('button', { class: 'btn', onclick: () => auth.msLogout() }, 'Odhlásit'));
}

function showDemoLogin() {
  mount(root, h('main', { class: 'login wide' }, h('div', { class: 'login-card' },
    h('div', { class: 'shapes' }, mark('ok'), mark('bad')),
    h('div', { class: 'eyebrow' }, 'Testovací prostředí'),
    h('h1', { class: 'title' }, CONFIG.appName),
    h('p', { class: 'sub' }, 'Smyšlená data uložená jen v tomto prohlížeči. Vyber účet, za který se přihlásíš – přepnout jde kdykoli tlačítkem „Testování“ nahoře.'),
    h('hr', { class: 'rule' }),
    testing.accountList(null),
    h('p', { class: 'muted small', style: { marginTop: '18px' } }, 'V ostrém provozu tu bude jen tlačítko „Přihlásit přes Microsoft“.'))));
}

// ---------- změna z jiné záložky (jen testovací prostředí) ----------
let remoteTimer = null;
let remoteKinds = new Set();
function onRemoteChange({ kinds }) {
  for (const k of kinds) remoteKinds.add(k);
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(applyRemote, 250);
}

async function applyRemote() {
  const kinds = remoteKinds; remoteKinds = new Set();
  if (!current) return;
  const refChanged = kinds.has('ref');
  if (refChanged) await ctx.reloadRef();
  const overlay = document.querySelector('.overlay');
  const { name, params } = current;
  // obrazovky bez rozepsaného formuláře se obnoví samy, jinde jen nabídneme obnovení
  const passive = (name === 'kontrola' && (!params[0] || document.querySelector('.decide'))) || name === 'dnes'
    || (name === 'sprava' && ['', 'incidenty', 'analyza', 'plneni', 'statistiky'].includes(params[0] || '') && !params[1]);
  if (!overlay && (passive || (name === 'trida' && refChanged))) {
    const y = window.scrollY;
    await route();
    window.scrollTo(0, y);
  } else if (kinds.size && !document.hidden && name !== 'trida' && name !== 'dozor' && !document.querySelector('.toast.remote')) {
    toast('Jiný účet právě něco zapsal.', { action: 'Obnovit', timeout: 6000, onAction: () => route() });
    const t = document.querySelector('#toasts .toast:last-child');
    if (t) t.classList.add('remote');
  }
}

// ---------- směrování ----------
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || '', params: parts.slice(1), query: new URLSearchParams(qs || '') };
}

async function route() {
  const r = parseHash();
  const allowed = auth.appsFor(ctx.user.role);
  let def = ROUTES[r.name];
  if (!def || !allowed.includes(def.app)) {
    // správce a vedení začínají ve Správě, ostatní ve své jediné aplikaci
    const first = allowed.includes('sprava') ? 'sprava' : allowed[0];
    const target = first === 'dozor' ? '#/kontrola' : `#/${first}`;
    if (location.hash !== target) { location.replace(target); return; }
    def = ROUTES[target.slice(2)];
  }
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  current = parseHash();
  const content = shell(def.app);
  try {
    const mod = await def.load();
    cleanup = await mod.render(content, ctx, r) || null;
  } catch (e) {
    console.error(e);
    mount(content, h('div', { class: 'box dashed' }, h('b', null, 'Tuhle obrazovku se nepodařilo načíst.'), h('p', null, e.message || String(e))));
  }
}

// ---------- hlavička ----------
let pill = null;
function updateOutboxPill() {
  if (!pill) return;
  if (outboxCount > 0) {
    pill.hidden = false;
    pill.textContent = `čeká na odeslání: ${outboxCount}`;
  } else pill.hidden = true;
}

function shell(app) {
  const apps = auth.appsFor(ctx.user.role);
  const tablet = app === 'trida';
  document.body.classList.toggle('tablet', tablet);
  pill = h('span', { class: 'pill warn', hidden: true, title: 'Záznamy jsou uložené v zařízení a odešlou se, až bude síť.' });
  updateOutboxPill();
  const content = h('main', { class: ['content', tablet ? 'wide' : ''] });

  const switcher = apps.length > 1 ? h('nav', { class: 'switcher', 'aria-label': 'Aplikace' },
    apps.map((a) => h('a', { href: auth.APPS[a].route, 'aria-current': a === app ? 'page' : null }, auth.APPS[a].label))) : null;

  const isRoomAccount = ctx.user.role === 'ucebna';
  const who = isRoomAccount && !demo ? null : h('button', {
    class: 'who', style: { background: 'none', border: 0, cursor: 'pointer' },
    onclick: demo ? () => testing.openTestPanel(ctx) : openUserMenu, 'aria-label': demo ? 'Testování – přepnout účet' : 'Účet a odhlášení',
  }, h('b', null, ctx.user.name), h('br'), auth.ROLE_LABEL[ctx.user.role]);
  const clock = demo ? testing.clockLabel() : null;

  mount(root, h('div', { class: 'shell' },
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'logo', 'aria-hidden': 'true' }),
        h('span', null, h('b', null, CONFIG.appName), h('small', null, ctx.ref.nastaveni.nazevSkoly || CONFIG.schoolName))),
      switcher,
      h('span', { class: 'spacer' }),
      demo ? h('button', { class: 'pill demo test-btn', onclick: () => testing.openTestPanel(ctx), title: 'Přepnout účet, testovací čas, data' },
        'Testování', clock ? h('span', { class: 'test-clock' }, clock) : null) : null,
      pill,
      who),
    content));
  return content;
}

function openUserMenu() {
  modal((close) => [
    h('div', { class: 'eyebrow' }, auth.ROLE_LABEL[ctx.user.role]),
    h('h2', { class: 'title' }, ctx.user.name),
    h('p', { class: 'muted' }, ctx.user.email),
    h('hr', { class: 'rule' }),
    h('button', { class: 'btn', onclick: () => auth.msLogout() }, 'Odhlásit'),
    h('div', { class: 'btn-row', style: { marginTop: '16px' } }, h('button', { class: 'btn ghost', onclick: close }, 'Zavřít')),
  ]);
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker', e));
  }
}

export { ctx };
