// Service worker: aplikace se načte i bez sítě. Data řeší fronta zápisů v aplikaci, ne tady.
// Při každé nové verzi zvyš číslo VERSION, ať si zařízení stáhnou nové soubory.
//
// Vlastní soubory se vždy ověřují u serveru (cache: 'no-cache'). GitHub Pages posílá soubory
// s desetiminutovou platností, a bez ověření by si prohlížeč po aktualizaci mohl vzít část
// souborů novou a část starou – aplikace pak hlásí „does not provide an export named …“.

const VERSION = 'zachody-v3';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/wc.js', 'js/demo-clock.js', 'js/demo-panel.js', 'js/config.js', 'js/ui.js', 'js/time.js', 'js/logic.js', 'js/data.js', 'js/auth.js',
  'js/store/idb.js', 'js/store/outbox.js', 'js/store/schema.js', 'js/store/demo.js', 'js/store/demo-data.js', 'js/store/sharepoint.js',
  'js/views/common.js', 'js/views/trida.js', 'js/views/kontrola.js', 'js/views/dozor.js', 'js/views/dnes.js',
  'js/views/sprava.js', 'js/views/sprava-nastaveni.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Microsoft (přihlášení, Graph, SharePoint) nikdy necachujeme
  if (/microsoftonline|graph\.microsoft|sharepoint\.com|msauth|live\.com/.test(url.hostname)) return;

  // vlastní soubory: nejdřív síť (ať se hned projeví nová verze), při výpadku mezipaměť
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
    return;
  }
  // knihovny a písma z CDN: mezipaměť napřed
  if (/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
