// Nastavení aplikace. Tohle je jediný soubor, který musíš upravit po registraci aplikace v Entra ID.
// Postup najdeš v SETUP.md.

export const CONFIG = {
  appName: 'Záchody',
  schoolName: 'ZŠ Karla Hašlera Libčice',

  // Dokud je clientId „DOPLNIT“, aplikace běží v demo režimu s ukázkovými daty.
  // Demo režim jde vynutit i adresou s ?demo=1 (např. na školení).
  msal: {
    clientId: 'DOPLNIT',
    tenantId: 'DOPLNIT',
  },

  // SharePoint web, kde jsou seznamy aplikace.
  sharepoint: {
    hostname: 'DOPLNIT.sharepoint.com',   // např. skolalibcice.sharepoint.com
    sitePath: '/sites/Zachody',
    photoFolder: 'FotkyIncidentu',        // složka v knihovně Dokumenty
  },

  // Skupiny Microsoft 365 → role. Stačí název skupiny (na velikosti písmen a diakritice nezáleží),
  // nebo její ID. Má-li účet víc rolí, platí nejvyšší: spravce > vedeni > ucitel > uklid > ucebna.
  roleGroups: {
    spravce: ['Záchody Správci'],
    vedeni: ['Vedení'],
    ucitel: ['Kantoři', 'Asistentky'],
    uklid: ['Záchody Úklid'],
    ucebna: ['Záchody Učebny'],
  },

  // Pojistka: tyto účty jsou správci vždy, i kdyby je někdo vyřadil ze skupiny.
  spravciEmails: [],

  // Oprávnění Microsoft Graph (delegovaná, se souhlasem správce za organizaci).
  scopes: ['User.Read', 'GroupMember.Read.All', 'Sites.ReadWrite.All'],
  // Jen pro jednorázové založení seznamů ve Správě → Instalace.
  installScopes: ['Sites.Manage.All'],

  // Knihovny z CDN (bez build kroku).
  cdn: {
    msal: 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@4/+esm',
    qrcode: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm',
    xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm',
  },
};

export function isDemo() {
  const p = new URLSearchParams(location.search);
  if (p.get('demo') === '1') return true;
  return !CONFIG.msal.clientId || CONFIG.msal.clientId === 'DOPLNIT';
}

// Adresa aplikace bez hashe – používá se v QR kódech a jako redirect URI.
export function appUrl() {
  return location.origin + location.pathname;
}
