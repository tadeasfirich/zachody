# Rozhodnutí mimo zadání

Co jsem při stavbě rozhodl sám, proč a jak to změnit.

| Rozhodnutí | Proč | Jak změnit |
|---|---|---|
| **Role ze skupin M365** přes `/me/memberOf` (oprávnění `GroupMember.Read.All`) | Zadání: přihlášení Microsoft účtem a role podle skupiny. Funguje se zabezpečenými i Microsoft 365 skupinami a nepotřebuje placené Entra ID P1. | `config.js` → `roleGroups`. Pojistka: `spravciEmails`. |
| **Přepínač aplikací** vidí správce a vedení; učitel jen Dozor a kontrolu; úklid jen Kontrolu; účet učebny jen tablet | Zadání z 21. 10. | `js/auth.js` → `appsFor()` |
| **Vedení vidí Správu**, ale ne žáky, číselníky, data a instalaci | Vedení řeší incidenty a analýzu, číselníky drží jeden člověk. Vedení smí měnit stav incidentu a zapnout zvýšený dohled. | `js/views/sprava.js` → `PAGES` |
| **Okno incidentu začíná poslední kontrolou s jakýmkoli výsledkem**, ne jen poslední „v pořádku“ | Kontrola se škodou je také známý stav. Nová škoda po ní je nová událost a okno se tím zúží. | `js/logic.js` → `lastCheckBefore()` |
| **Široké okno**: když ten den chybí dřívější kontrola, okno začíná poslední kontrolou, nejvýš 3 dny zpět, a je viditelně označené | Bez toho by ranní škoda nesla jména z celého předchozího dne bez varování. | `computeWindow()` |
| **Analýza počítá „očekávaně“** z toho, jak často žák na danou toaletu chodí, a z délky oken | Žák, který chodí často (třeba ze zdravotních důvodů), by se jinak dostal nahoru jen proto. Řazení je podle „nad očekávání“. | `overlapAnalysis()` |
| **Bez žebříčku četnosti odchodů** nikde v aplikaci | Zadání kap. 10. | – |
| **Jména v okně**: správce, vedení, učitel-oznamovatel ano; uklízečka jen počet | Minimalizace osobních údajů. | Správa → Číselníky a pravidla → Obecné |
| **Odchody v okně se při nahlášení škody označí** (`Navstevy.Incident`) | Noční tok pak smaže jen to, co k žádné škodě nepatří, jednoduchým filtrem. | `js/views/kontrola.js` |
| **Stav tabletu (kdo je venku, jaká hodina) je v zařízení**, do SharePointu jde jen záznam | Tablet musí fungovat i bez sítě a nesmí čekat na server, když žák ťukne. | `js/views/trida.js` |
| **Fronta zápisů v IndexedDB** pro všechny zápisy, včetně fotek | Výpadek wifi nesmí ztratit data. Čas události je čas ťuknutí, ne odeslání. | `js/store/outbox.js` |
| **Fotky se zmenší na 1600 px, JPEG 0,8** a ukládají do `Dokumenty/FotkyIncidentu/<id incidentu>` | Rychlé odeslání z mobilních dat. Jedna složka na incident. | `js/data.js` → `compressImage()`; `config.js` → `photoFolder` |
| **ID položek ve sloupci Title**, odkazy jako text místo vyhledávacích sloupců SharePointu | Jednodušší zápis přes Graph a fronta umí položku najít i po výpadku. | `js/store/schema.js` |
| **Seznam `SlotyKontrol`** přepočítává aplikace při každém uložení zvonění, plánu, rozpisu, toalet a obecného nastavení | Power Automate pak jen porovnává čísla a nemusí počítat přestávky. Minuty dne (`MinDo`) jsou čísla, aby filtr v Power Automate fungoval spolehlivě. | `buildSlotTemplate()` |
| **Okno slotu**: začátek přestávky −5/+3 min, konec přestávky −3/+5 min, k tomu tolerance 5 min | Podle zadání; tolerance pokryje to, že dozor dojde o chvíli později. | Správa → Obecné → Tolerance; `js/time.js` → `slotRange()` |
| **Plán dozorů po patrech**: dozor na patře kontroluje obě toalety na svém patře | Zadání nespecifikovalo, kdo kontroluje kterou toaletu. | Plán dozorů |
| **Učitelé do plánu dozorů** se přidávají ručně (jméno + e-mail) | Nechtěl jsem kvůli tomu číst členy skupin. | Správa → Plán dozorů → Přidat učitele |
| **Vrácení zápisu u dveří** do 1 minuty (zadání 30 s) | O přestávce je chaos; minuta je realističtější a pořád krátká. | `js/views/dozor.js` → `undo()` |
| **Smíšená skupina**: tablet bez třídy, žáci se hledají podle příjmení | Školení a akce se zástupci více tříd. | – |
| **Relace „mimořádná hodina“** mimo rozvrh trvá 50 minut | Kroužky, doučování. | `relaceActive()` v `trida.js` |
| **QR kód obsahuje token**; po vygenerování nových tokenů staré štítky fungují dál s upozorněním | Výměna štítků nesmí zablokovat kontroly. | Správa → QR štítky |
| **Knihovny z CDN** (MSAL, QR, SheetJS) přes jsdelivr `+esm` | Bez build kroku; service worker si je uloží pro práci offline. | `config.js` → `cdn` |
| **Notifikace přes Power Automate** (e-mail + Teams Flow bot), ne web push | Web push potřebuje vlastní server; Teams na telefonu doručí push bez něj. | Verze 2: Azure Function + VAPID |

## Pro verzi 2

- `Sites.Selected` místo `Sites.ReadWrite.All` – aplikace pak smí jen na web Záchody (nastavuje se přes Graph `POST /sites/{id}/permissions`).
- Web push přímo z PWA (malá Azure Function).
- Předvyplnění třídy podle stálého rozvrhu a napojení na aplikaci Rezervace IT pro IT učebnu.
- Ověření QR tokenu přímo při kontrole (dnes jen upozornění).
