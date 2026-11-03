# Megaprompt – aplikace „Záchody“ (původně pracovní název „Čisté WC“)

## 0. Role a způsob práce

Jsi zkušený vývojář webových aplikací a zároveň znáš provoz české základní školy a digitální gramotnost běžného učitele. Stavíš progresivní webovou aplikaci (PWA) pro ZŠ Karla Hašlera v Libčicích nad Vltavou. Zadavatel je Tadeáš, učitel informatiky a matematiky a správce školního Microsoft 365. Kód bude udržovat sám, takže:

- Piš čitelný kód bez build kroku (čisté HTML, CSS, JavaScript jako ES moduly). Knihovny jen z CDN.
- Komentáře a texty v UI česky. Názvy proměnných anglicky.
- Každé rozhodnutí, které není v zadání, zapiš do `ROZHODNUTI.md` (co, proč, jak změnit).
- Postupuj po fázích (kap. 12). Po každé fázi musí aplikace jít spustit a vyzkoušet.
- Když něco v zadání nedává smysl nebo si odporuje, zeptej se, nehádej.

## 1. Problém a cíl

Žáci opakovaně ničí toalety na všech třech patrech (přízemí, 1. patro, 2. patro). Nevíme, jestli jde o jednotlivce, jednu skupinu, nebo víc skupin. Cílem je:

1. **Prevence** – žáci vědí, že systém existuje. To samo o sobě sníží počet incidentů.
2. **Zúžení okruhu** – při nálezu škody vědět, kdo byl na dané toaletě od poslední kontroly „v pořádku“.
3. **Odhalení vzorce** – kdo se opakovaně objevuje v časových oknech incidentů.
4. **Spolehlivost kontrol** – vidět, které kontroly chybí a kdo na ně zapomíná.

### Princip „poslední čistý stav“ (jádro celé logiky)

Každá toaleta má časovou osu dvou typů událostí:

- **Návštěva** – žák šel na toaletu (záznam z tabletu ve třídě nebo od dozoru u dveří).
- **Kontrola** – dospělý potvrdil stav: „v pořádku“, nebo „škoda“.

Když kontrola zjistí škodu, vznikne **incident** a k němu **okno incidentu** = interval od poslední kontroly „v pořádku“ na téže toaletě do času nálezu. Všechny návštěvy v okně jsou **výskyty v okně**. Čím častější kontroly, tím užší okno.

Jeden incident nic nedokazuje. Analytika proto pracuje s **překryvem**: u každého žáka počet incidentů, v jejichž okně se vyskytl, vůči počtu incidentů na toaletách, kam chodí. Data jsou **indicie, ne důkaz**. UI to musí jasně říkat.

## 2. Prostředí školy

- **3 patra**, na každém **toaleta chlapci + toaleta dívky** → 6 toalet. Kódy: `P-CH`, `P-D`, `1-CH`, `1-D`, `2-CH`, `2-D`.
- **19 tříd**. Seminář z matematiky a češtiny spojuje typicky 2 paralelky (např. 8.A + 8.B). Výjimečně školení nebo akce se zástupci více tříd.
- **Každá učebna má jeden tablet** s aplikací. Každá učebna má **vlastní školní e-mail** (účet M365), přes který je tablet přihlášený.
- **Učitelé** mají vlastní telefony a školní účty M365 (`@skola.libcice.cz`).
- **Uklízečka** má školní účet M365 i telefon.
- **Žáci** mají na doméně účty, ale do aplikace přístup **nemají**. Seznamy žáků se importují z Excelu (export ze Školy OnLine).
- Školní skupiny M365: zaměstnanci, vedení, kantoři, asistentky.
- Časy zvonění, plán dozorů a rozpis kontrol **zatím neznáme** – musí být nastavitelné ve správě, s rozumnými výchozími hodnotami (viz kap. 6).

## 3. Role uživatelů

| Role | Kdo | Zařízení | Co dělá |
|---|---|---|---|
| `ucebna` | účet učebny | tablet ve třídě | výběr třídy na začátku hodiny, odchody a návraty žáků |
| `ucitel` | kantoři, asistentky | telefon | kontroly toalet, nahlášení škody s fotkou, dozor u dveří |
| `uklid` | uklízečky | telefon | kontroly toalet, nahlášení škody s fotkou |
| `vedeni` | vedení školy | telefon, PC | totéž co učitel + čtení správy |
| `spravce` | Tadeáš | PC | všechno včetně nastavení, importu, uživatelů |

**Přihlášení:** jediné tlačítko „Přihlásit přes Microsoft“. Role se určí podle **skupin M365**, do kterých správce účet zařadí (Graph `/me/memberOf`, oprávnění `GroupMember.Read.All` se souhlasem správce). Mapování skupina → role je v `config.js`. Má-li účet víc rolí, platí nejvyšší: správce > vedení > učitel > úklid > učebna. Kdo není v žádné skupině, uvidí „Nemáš přístup – napiš správci“.

**Přepínání aplikací:**

| Role | Vidí aplikace |
|---|---|
| `spravce` | Tablet ve třídě, Dozor a kontrola, Správa (přepínač v hlavičce) |
| `vedeni` | Tablet ve třídě, Dozor a kontrola, Správa (přepínač v hlavičce) |
| `ucitel` | jen Dozor a kontrola |
| `uklid` | jen Kontrola |
| `ucebna` | jen Tablet ve třídě, napevno svoje učebna |

Skrytí v UI není zabezpečení; data chrání oprávnění SharePoint webu.

## 4. Architektura

- **Frontend:** jedna PWA, jedna kódová základna, pohledy podle role. Hash routing:
  - `#/trida` – tablet ve třídě
  - `#/kontrola` a `#/kontrola/P-CH` – kontrola konkrétní toalety (cíl QR kódu)
  - `#/dozor` – zvýšený dohled u dveří
  - `#/sprava/...` – správa a statistiky
- **Hosting:** GitHub Pages (např. `tadeasfirich.github.io/ciste-wc`).
- **Přihlášení:** MSAL Browser (z CDN), školní tenant, registrace aplikace v Entra ID typu SPA. Přihlášení učebny si tablet pamatuje (refresh token, `localStorage` cache MSAL).
- **Data:** SharePoint Online – samostatný web `Čisté WC`, seznamy přes Microsoft Graph REST (`/sites/{id}/lists/{list}/items`). Fotky v knihovně dokumentů téhož webu.
- **Oprávnění Graph (delegovaná):** `User.Read` + přednostně `Sites.Selected` s udělením přístupu jen k webu Čisté WC. Pokud to v tenantu nepůjde, `Sites.ReadWrite.All` a přístup omezit oprávněními SharePoint webu. Rozdíl popiš v `SETUP.md`.
- **Offline:** service worker (cache aplikace) + IndexedDB „outbox“. Každý zápis jde nejdřív do outboxu s časem vzniku na zařízení, pak se odešle. Při výpadku sítě aplikace běží dál a ukazuje malý indikátor „čeká na odeslání: 3“. Fotky se ve frontě zmenší (max 1600 px, JPEG 0,8).
- **Čas:** ukládej v UTC (ISO 8601), zobrazuj v Europe/Prague. Čas události = čas na zařízení v okamžiku ťuknutí, ne čas odeslání.
- **Notifikace:** Power Automate (kap. 9). Web push z PWA až ve verzi 2.
- **Demo režim:** přepínač, kdy aplikace běží nad `localStorage` s ukázkovými daty (19 tříd, smyšlená jména) bez přihlášení. Slouží k vyzkoušení UI před nastavením M365. Datová vrstva je proto za rozhraním `DataStore` se dvěma implementacemi: `SharePointStore` a `DemoStore`.

## 5. SharePoint – datový model

Vytvoř skript (PnP PowerShell **nebo** návod klikáním, obojí v `SETUP.md`), který založí web a tyto seznamy. Interní názvy sloupců bez diakritiky.

**Uzivatele** – Email (text, jedinečný), Jmeno, Role (volba: spravce, vedeni, ucitel, uklid, ucebna), Ucebna (lookup, jen u role ucebna), Notifikace (ano/ne), Aktivni.

**Toalety** – Kod (`P-CH`…), Nazev („Přízemí – chlapci“), Patro (0/1/2), Typ (CH/D), QrToken (náhodný řetězec do URL), Aktivni.

**Ucebny** – Nazev, Patro, Ucet (e-mail), MaxVenku (číslo, výchozí 1), Aktivni.

**Tridy** – Nazev (`7.A`), Rocnik, Aktivni.

**Zaci** – Jmeno, Prijmeni, Trida (lookup), TypWC (CH/D), Aktivni, ImportId (klíč z exportu). **Žádné zdravotní ani jiné citlivé poznámky.** Výjimku toalety řeš jen polem TypWC.

**Zvoneni** – Hodina (0–8), Zacatek, Konec (čas). Přestávky se dopočítají.

**PlanDozoru** – DenTydne, Prestavka (po kolikáté hodině), Patro, Ucitel (e-mail). Z něj vznikají očekávané kontroly.

**RozpisKontrol** – Prestavka, TypSlotu (`konec-hodiny` = před začátkem přestávky; `konec-prestavky` = před další hodinou), Povinne (ano/ne), Tolerance (min).

**Relace** – Ucebna, Tridy (více hodnot), Zacatek, Konec, Spustil (e-mail). Jedna relace = jedna vyučovací hodina na tabletu.

**Navstevy** – Zak (lookup), Toaleta (lookup), CasOd, CasDo (může být prázdné), Zdroj (tablet/dozor), Ucebna, Relace, Zapsal (e-mail účtu), AutoUzavreno (ano/ne), Incident (lookup, prázdné = nenavázáno).

**Kontroly** – Toaleta, Cas, Stav (ok/skoda), Kontroloval (e-mail), Role, Slot (text, např. `út 3. přestávka – konec-prestavky`, prázdné = mimořádná), Poznamka.

**Incidenty** – Toaleta, CasNalezu, Kategorie (ucpane, rozbite, pocmarane, vytopene, znecistene, jine), Popis, Zavaznost (1–3), OknoOd (= čas poslední OK kontroly), Nahlasil, Stav (novy, resi-se, uzavreno), Zaver (text při uzavření).

**ZvysenyDohled** – Patro nebo Toaleta, Od, Do, Duvod. Když běží, dozor má k dispozici režim „u dveří“ a správa ho zvýrazňuje.

**Nastaveni** – Klic, Hodnota. Minimálně: `retenceDni` (30), `autoUzavreniMin` (10), `jmenaVidiUklid` (ne), `nazevSkoly`.

**Knihovna FotkyIncidentu** – složka na incident (`2026-10-21_1-CH_0042`).

**Oprávnění webu:** správce = vlastník; vedení, kantoři, uklízečky, účty učeben = přispěvatelé. Žáci nemají přístup. V seznamu `Navstevy` a `Relace` nastavit v Upřesňujícím nastavení „Číst: jen vlastní položky“ a „Upravovat: jen vlastní položky“ – účet učebny pak vidí jen svoje záznamy a správce vidí vše. Aplikace musí s tímto omezením počítat (učitel na telefonu nevidí cizí návštěvy, jen správa a vedení).

## 6. Moduly

### A) Tablet ve třídě (`#/trida`)

Cíl: žák zapíše odchod za 2 sekundy, učitel tablet během hodiny vůbec neřeší.

1. **Začátek hodiny.** Podle tabulky `Zvoneni` tablet pozná novou hodinu a ukáže obrazovku „Kdo tu teď je?“: 19 dlaždic tříd seřazených podle ročníku. Učitel ťukne jednu nebo dvě (víc jen přes „Další třídy…“). Tlačítko „Stejná jako minule“, pokud je to stejná hodina rozvrhu jako minulý týden v tento den. Volba „Bez třídy / volno“ (tablet se uzamkne do další hodiny).
2. **Hlavní obrazovka.** Mřížka jmen žáků (velké dlaždice, příjmení + jméno, seskupené po třídách, když jsou dvě). Hledání jménem pro žáka z jiné třídy (seminář, suplování).
3. **Odchod.** Žák ťukne své jméno → potvrzovací obrazovka s velkým jménem „Odcházíš: Jana Nováková – toaleta 1. patro dívky“ a tlačítko „Jdu“. Toaleta se předvyplní podle patra učebny a TypWC; jde změnit (jiné patro).
4. **Venku.** Nahoře pás „Venku: Jana N. – 3 min“. Když je venku `MaxVenku` žáků, ostatní dlaždice jsou neaktivní s hláškou „Počkej, až se Jana vrátí“. Aplikace odchod **nezakazuje** nad rámec tohoto pravidla a učitel může pravidlo jedním ťuknutím pro tuto chvíli obejít.
5. **Návrat.** Ťuknutí na pás nebo na své jméno → „Jsem zpět“. Po `autoUzavreniMin` bez návratu se záznam sám uzavře, označí `AutoUzavreno` a pás dostane čárkovaný obrys (viz design).
6. **Ochrana.** Výběr třídy a nastavení tabletu pod dlouhým stiskem (2 s) a volitelným PINem učebny. Žák nemá jak se dostat k historii.
7. **Známé riziko:** žák může ťuknout cizí jméno. Proto potvrzovací obrazovka s velkým jménem (učitel ji vidí z katedry) a v analytice upozornění, že data jsou orientační.

### B) Kontrola toalety (`#/kontrola`, telefon)

Cíl: dvě ťuknutí.

1. Vstup přes **QR kód na dveřích** (URL s kódem toalety a QrToken) nebo ze seznamu 6 toalet seskupených po patrech.
2. Obrazovka toalety: název, kdy byla poslední kontrola a s jakým výsledkem, kolik návštěv od ní.
3. Dvě velká tlačítka: **„V pořádku“** a **„Škoda“**.
4. „Škoda“ → kategorie (dlaždice), závažnost 1–3, volitelný krátký popis, **fotky** (`<input type="file" accept="image/*" capture="environment" multiple>`), odeslat. Vznikne kontrola se stavem `skoda` + incident.
5. Po odeslání incidentu: přehled okna – „Od poslední kontroly v pořádku (10:42) tu bylo 7 žáků“ a seznam jmen s třídou a časem. Kdo seznam jmen vidí, řídí kap. 10.
6. Aplikace sama pozná, ke kterému **slotu** z rozpisu kontrola patří (podle času a tolerance). Kontrola mimo slot = mimořádná.

### C) Dozor u dveří – zvýšený dohled (`#/dozor`)

Zapíná se, když na patře běží `ZvysenyDohled` (nebo ručně kdykoli).

1. Výběr toalety (předvyplněná podle patra dozoru z `PlanDozoru`).
2. Dlaždice tříd → rozkliknutí → jména → ťuknutí = **vstup** (Navsteva se zdrojem `dozor`, CasDo prázdné).
3. Poslední zapsaní nahoře, ťuknutím jde zápis vrátit do 30 s (překliknutí).
4. Volitelně ťuknutí na odchod; není povinné.
5. Rychlé hledání podle příjmení (3 písmena).

### D) Úklid

Stejné obrazovky jako modul B, role `uklid`. Navíc přehled „Dnešní kontroly a incidenty“ pro její směnu. Jména žáků v okně incidentu vidí jen při `jmenaVidiUklid = ano`, jinak jen počet.

### E) Správa (`#/sprava`, PC i telefon)

1. **Přehled** – dnešní stav všech 6 toalet (poslední kontrola, stav, otevřené incidenty), chybějící kontroly dnes, běžící zvýšený dohled.
2. **Incidenty** – seznam s filtry (toaleta, patro, kategorie, stav, období). Detail: fotky, okno, výskyty v okně, změna stavu, závěr. Tlačítko „Spustit zvýšený dohled na tomto patře“ (na zvolený počet dní).
3. **Analýza překryvu** – tabulka žáků, kteří se vyskytli v oknech ≥ 2 incidentů v období. Sloupce: žák, třída, počet oken s výskytem, počet incidentů na toaletách daného typu, podíl. Filtr podle patra a období. Pohled po třídách a po skupinách žáků, kteří se v oknech objevují **společně** (dvojice a trojice, které spolu sdílí ≥ 2 okna). Nahoře trvalé upozornění: „Indicie, ne důkaz. Před jakýmkoli krokem mluv se žákem a postupuj podle školního řádu.“ **Nikde** se nezobrazuje pořadí žáků podle počtu návštěv toalet celkově.
4. **Plnění kontrol** – očekávané sloty (z `RozpisKontrol` × `PlanDozoru`) vs. provedené. Po učitelích a po týdnech, procento splnění, poslední vynechání. Tón věcný, ne pranýřovací.
5. **Statistiky** – incidenty po týdnech, podle toalet, dnů v týdnu a přestávek (heatmapa den × přestávka), průměrná šířka okna (= jak účinné jsou kontroly).
6. **Import žáků** – nahrání XLSX/CSV (SheetJS z CDN), mapování sloupců (jméno, příjmení, třída, pohlaví → TypWC), náhled, rozdíl proti stávajícím (noví, odešlí, přeřazení), potvrzení. Odešlí žáci se deaktivují, nemažou (historie incidentů).
7. **Číselníky** – toalety, učebny, třídy, uživatelé a role, zvonění, plán dozorů, rozpis kontrol, nastavení.
8. **QR karty** – tisk A4 se 6 kartami do rámečku na dveře (kap. 11). Možnost přegenerovat QrToken.
9. **Export** – incident jako PDF/tisk pro jednání s rodiči (bez jmen ostatních žáků), data do CSV.
10. **Retence** – přehled, kolik záznamů bude smazáno, ruční spuštění (automaticky dělá Power Automate).

## 7. Okraje a výjimky, které musí aplikace zvládnout

- Zapomenutý návrat → auto-uzavření, označení.
- Dva tablety zapíšou stejného žáka (chyba) → povolit, v analýze sloučit překrývající se návštěvy.
- Tablet offline celou hodinu → outbox, správné časy z místa ťuknutí.
- Učitel nevybere třídu → tablet ukazuje výběr, žák si může najít jméno hledáním; relace se založí s prázdnou třídou.
- Spojené třídy, smíšená skupina, suplování, žák z jiné třídy.
- Odpadlá hodina, školní akce, prázdniny, ředitelské volno → ve správě „dny bez provozu“, očekávané kontroly se negenerují.
- Nový žák během roku, přestup mezi třídami.
- Dvojí kontrola téhož slotu → počítá se první, druhá je mimořádná.
- QR naskenovaný nepřihlášeným telefonem → přihlášení a pak rovnou do kontroly té toalety.
- Škoda nalezená bez předchozí OK kontroly v daný den → okno od konce posledního dne s kontrolou, výrazně označené jako „široké okno“.

## 8. Čas a sloty

Výchozí zvonění, dokud ho správce nezmění: 1. 8:00–8:45, 2. 8:55–9:40, 3. 10:00–10:45, 4. 10:55–11:40, 5. 11:50–12:35, 6. 12:45–13:30, 7. 13:40–14:25.

Slot `konec-hodiny` = posledních 5 min hodiny + první 3 min přestávky. Slot `konec-prestavky` = poslední 3 min přestávky + první 5 min hodiny. Tolerance nastavitelná. Výchozí rozpis: `konec-prestavky` povinný po každé přestávce, `konec-hodiny` nepovinný (zadavatel ví, že na začátek přestávky dozor často nestihne).

## 9. Notifikace – Power Automate

Dodej v `SETUP.md` krok-za-krokem návod (se screenshot popisy, pro člověka, který v Power Automate začíná) na tři toky:

1. **Chybějící kontrola** – plánovaný tok každých 5 min v pracovní dny 7:30–15:00. Vezme sloty, kterým právě skončila tolerance, a ověří v `Kontroly`. Když chybí: zpráva do Teams (chat s botem Flow) a e-mail příslušnému dozoru a všem z `Uzivatele` s `Notifikace = ano`. Text: která toaleta, která přestávka, kdo měl dozor. Aby se toky nespouštěly zbytečně, aplikace zapisuje očekávané sloty na den do seznamu `OcekavaneKontroly` (doplň do modelu) a tok jen kontroluje stav.
2. **Nový incident** – při vytvoření položky v `Incidenty` okamžitě Teams + e-mail vedení a lidem se zapnutými notifikacemi, s odkazem do správy.
3. **Retence** – každou noc smaže `Navstevy` a `Relace` starší než `retenceDni`, které nejsou navázané na incident. Navázané návštěvy se mažou s uzavřeným incidentem po konci školního roku.

Standardní konektory (SharePoint, Outlook, Teams) – žádná prémiová licence.

## 10. Ochrana osobních údajů a pravidla

- Aplikace eviduje osobní údaje nezletilých. V `SETUP.md` připomeň: před spuštěním probrat s pověřencem pro ochranu osobních údajů a ředitelem, doplnit školní řád, informovat žáky a rodiče.
- **Minimalizace:** u žáka jen jméno, příjmení, třída, typ WC. Žádné zdravotní údaje.
- **Retence** 30 dní pro nenavázané návštěvy (nastavitelné).
- **Kdo vidí jména v okně incidentu:** správce a vedení vždy; učitel, který incident nahlásil, ano; uklízečka jen při `jmenaVidiUklid = ano`. Analýzu překryvu vidí jen správce a vedení.
- Žádné žebříčky „kdo chodí nejčastěji“. Žádné slovo „podezřelý“ v UI; používej „výskyt v okně“.
- Aplikace nikdy neodmítne žákovi odchod mimo pravidlo `MaxVenku`.
- Tablet: doporučení v `SETUP.md` nastavit režim jedné aplikace (Android: připnutí aplikace; iPad: Řízený přístup).
- Do URL nikdy nedávej jména ani jiné osobní údaje.

## 11. Design – Tadeášův vizuální systém, přenesený na obrazovku

- **Barvy:** jediný akcent kobaltová `#2A4B9B`. Text `#14171f`, tlumený text `#5a6172`, linky `#b9c0ce`, podklad karet `#eef1f7`, tmavá karta `#14171f` s textem bílým a nadpisem `#9fb2e8`. Žádné další barvy.
- **Význam nese tvar, ne jen barva:**
  - v pořádku = **kolečko** (kobaltový obrys/výplň),
  - škoda = **plný čtverec** (černý),
  - čeká / chybí kontrola = **čárkovaný obrys**,
  - auto-uzavřený návrat = čárkovaný obrys dlaždice.
- **Písmo:** Carlito (Google Fonts), záloha `"DejaVu Sans", sans-serif`. Popisky, časy, kódy toalet a nadpisy verzálkami prostrkaně v `"DejaVu Sans Mono", ui-monospace`.
- **Hlavička obrazovky:** `.eyebrow` (mono, verzálky, prostrkané, kobalt) – název – tenká čára 2,5 px černá.
- **Karty** s 1px linkou `#b9c0ce`, radius 2 px. Žádné stíny, žádné gradienty, žádné emoji.
- **Čeština:** uvozovky „takto“, pomlčka –, nikdy oddělovač `·` ani `•` (místo nich středník nebo pomlčka). Text nikdy do bloku.
- **Dotykové cíle:** tablet min. 64 px, telefon min. 48 px. Jména žáků min. 20 px.
- **Krátké texty**, sloveso na začátku tlačítek („Zapsat odchod“, „Nahlásit škodu“).
- Čitelnost pro dyslektiky: řádkování 1,45, žádná kurzíva v delších textech, vysoký kontrast.
- **QR karty k tisku:** A4 na výšku, 6 karet (2 × 3), každá: eyebrow `ČISTÉ WC – KONTROLA`, název toalety velkým písmem, QR kód (knihovna z CDN), věta „Naskenuj a potvrď stav. Dvě ťuknutí.“, čárkovaný rámeček k vystřižení. Musí snést černobílý tisk.
- Ikona a manifest PWA: geometrická (kruh a čtverec), kobalt na bílé.

## 12. Fáze vývoje a akceptační kritéria

**Fáze 1 – Kostra a demo režim.** Struktura souborů, router, design systém (`styles.css` s tokeny), `DataStore` + `DemoStore` s ukázkovými daty, manifest, service worker. *Hotovo, když:* aplikace jde nainstalovat jako PWA a v demo režimu přepínám role.

**Fáze 2 – Tablet ve třídě.** Modul A kompletně nad DemoStore. *Hotovo, když:* zvládnu výběr 2 tříd, odchod, blokaci druhého žáka, návrat, auto-uzavření a práci offline.

**Fáze 3 – Kontrola, úklid, dozor.** Moduly B, C, D, fotky, výpočet okna. *Hotovo, když:* nahlásím škodu s fotkou a vidím správné výskyty v okně.

**Fáze 4 – Správa.** Modul E včetně importu, analýzy překryvu, plnění kontrol a tisku QR karet. *Hotovo, když:* z demo dat (vygeneruj 4 týdny realistického provozu s jednou „skrytou“ dvojicí, která dělá škody) analýza tu dvojici ukáže nahoře.

**Fáze 5 – SharePoint.** `SharePointStore`, MSAL, `SETUP.md` (registrace aplikace, web, seznamy, oprávnění, účty učeben, Power Automate, tablety). *Hotovo, když:* stejné scénáře jako ve fázích 2–4 fungují nad SharePointem.

**Fáze 6 – Doladění.** Retence, export, přístupnost, test na Androidu a iPhonu, `README.md` psané z pohledu učitele (jak to používat, ne jak to funguje).

## 13. Výstupy

- Repozitář připravený pro GitHub Pages: `index.html`, `app.js`, `modules/`, `styles.css`, `sw.js`, `manifest.webmanifest`, `icons/`.
- `SETUP.md` – krok za krokem pro správce M365, který v nastavování nejistí: Entra ID, SharePoint, oprávnění, Power Automate, tablety.
- `README.md` – pro učitele a uklízečku, jedna strana na roli.
- `ROZHODNUTI.md` – rozhodnutí mimo zadání.
- Skript nebo návod pro založení seznamů.

## 14. Otevřené otázky (do té doby platí výchozí hodnoty)

1. ~~Kdo je pan Švarc?~~ Vyřešeno: vedení. Upozornění na chybějící kontrolu a nové incidenty jdou skupině vedení (e-mail + Teams) a dozoru, který kontrolu vynechal.
2. Které přestávky se kontrolují a kdo kontroluje kterou toaletu? → zatím: dozor na svém patře, `konec-prestavky` po každé přestávce.
3. Skutečné časy zvonění a plán dozorů. → zatím výchozí z kap. 8, plán dozorů prázdný.
4. Má uklízečka vidět jména žáků v okně incidentu? → zatím ne, jen počet.
5. Délka uchování záznamů. → zatím 30 dní.
6. V budoucnu: napojení na aplikaci Rezervace IT (předvyplnění třídy v IT učebně podle rezervace) a stálý rozvrh pro předvýběr třídy.
