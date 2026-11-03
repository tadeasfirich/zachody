// Přihlášení. V demo režimu výběr role, jinak Microsoft účet (MSAL) a role ze skupin M365.

import { CONFIG, isDemo, appUrl } from './config.js';
import { DEMO_USERS } from './store/demo-data.js';
import { normalize } from './ui.js';

export const ROLE_ORDER = ['spravce', 'vedeni', 'ucitel', 'uklid', 'ucebna'];
export const ROLE_LABEL = { spravce: 'Správce', vedeni: 'Vedení', ucitel: 'Učitel', uklid: 'Úklid', ucebna: 'Učebna' };

// Které aplikace role vidí. Pořadí = pořadí v přepínači.
export const APPS = {
  trida: { label: 'Tablet ve třídě', route: '#/trida' },
  dozor: { label: 'Dozor a kontrola', route: '#/kontrola' },
  sprava: { label: 'Správa', route: '#/sprava' },
};
export function appsFor(role) {
  if (role === 'spravce' || role === 'vedeni') return ['trida', 'dozor', 'sprava'];
  if (role === 'ucitel' || role === 'uklid') return ['dozor'];
  if (role === 'ucebna') return ['trida'];
  return [];
}

// ---------- demo ----------
// Testovací účet se pamatuje pro každou záložku zvlášť – v jedné záložce můžeš mít tablet,
// v druhé učitele na dozoru. Nová záložka převezme naposledy použitý účet.
export function demoUser() {
  try {
    const email = sessionStorage.getItem('demo-user') || localStorage.getItem('demo-user-last');
    return DEMO_USERS.find((u) => u.email === email) || null;
  } catch { return null; }
}
export function demoLogin(u) {
  try { sessionStorage.setItem('demo-user', u.email); localStorage.setItem('demo-user-last', u.email); } catch { /* nic */ }
}
export function demoLogout() {
  try { sessionStorage.removeItem('demo-user'); localStorage.removeItem('demo-user-last'); } catch { /* nic */ }
}
export { DEMO_USERS };

// ---------- Microsoft ----------
let msal = null, pca = null, account = null;

async function loadMsal() {
  if (pca) return pca;
  msal = await import(CONFIG.cdn.msal);
  pca = new msal.PublicClientApplication({
    auth: {
      clientId: CONFIG.msal.clientId,
      authority: `https://login.microsoftonline.com/${CONFIG.msal.tenantId}`,
      redirectUri: appUrl(),
      navigateToLoginRequestUrl: false,
    },
    cache: { cacheLocation: 'localStorage' }, // tablet zůstane přihlášený i po restartu
  });
  await pca.initialize();
  return pca;
}

// Vrací účet, nebo null (nepřihlášen). Zpracuje i návrat z přihlašovací stránky.
export async function msInit() {
  const p = await loadMsal();
  const res = await p.handleRedirectPromise();
  if (res && res.account) account = res.account;
  if (!account) account = p.getActiveAccount() || p.getAllAccounts()[0] || null;
  if (account) p.setActiveAccount(account);
  return account;
}

export async function msLogin() {
  const p = await loadMsal();
  // po přihlášení se vrátíme tam, odkud uživatel přišel (např. z QR kódu)
  localStorage.setItem('return-hash', location.hash || '');
  await p.loginRedirect({ scopes: CONFIG.scopes, prompt: 'select_account' });
}

export async function msLogout() {
  const p = await loadMsal();
  await p.logoutRedirect({ account, postLogoutRedirectUri: appUrl() });
}

export async function getToken(scopes) {
  const p = await loadMsal();
  const req = { scopes: scopes || CONFIG.scopes, account };
  try {
    const r = await p.acquireTokenSilent(req);
    return r.accessToken;
  } catch (e) {
    if (e instanceof msal.InteractionRequiredAuthError) {
      localStorage.setItem('return-hash', location.hash || '');
      await p.acquireTokenRedirect(req);
      return new Promise(() => {}); // stránka se přesměruje
    }
    throw e;
  }
}

// Role ze skupin. Graph: /me/memberOf (potřebuje GroupMember.Read.All).
export async function msUser() {
  const token = await getToken();
  const get = async (url) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw Object.assign(new Error(`Graph ${r.status}`), { status: r.status });
    return r.json();
  };
  const me = await get('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName');
  const groups = [];
  let url = 'https://graph.microsoft.com/v1.0/me/memberOf/microsoft.graph.group?$select=id,displayName&$top=999';
  while (url) { const r = await get(url); groups.push(...r.value); url = r['@odata.nextLink']; }

  const email = (me.mail || me.userPrincipalName || '').toLowerCase();
  const roles = new Set();
  for (const [role, names] of Object.entries(CONFIG.roleGroups)) {
    const wanted = names.map(normalize);
    if (groups.some((g) => wanted.includes(normalize(g.displayName)) || wanted.includes(normalize(g.id)))) roles.add(role);
  }
  if (CONFIG.spravciEmails.map((e) => e.toLowerCase()).includes(email)) roles.add('spravce');
  const role = ROLE_ORDER.find((r) => roles.has(r)) || null;
  return { name: me.displayName, email, role, roles: [...roles], groups: groups.map((g) => g.displayName) };
}

export function takeReturnHash() {
  const h = localStorage.getItem('return-hash');
  localStorage.removeItem('return-hash');
  return h;
}

export { isDemo };
