# Záchody – nastavení ostrého provozu

Návod pro správce školního Microsoft 365. Kroky jdou po sobě, každý končí tím, co máš vidět. Počítej zhruba se dvěma odpoledni: jedno na Microsoft 365 a SharePoint, druhé na Power Automate a tablety.

Obsah:

0. Než začneš – GDPR a školní řád
1. Vyzkoušej demo
2. Nahraj aplikaci na GitHub Pages
3. Skupiny v Microsoft 365
4. Účty pro tablety v učebnách
5. SharePoint web
6. Registrace aplikace v Entra ID
7. Vyplň `config.js`
8. Založ seznamy (tlačítko v aplikaci)
9. Naplň číselníky
10. QR štítky
11. Tablety ve třídách
12. Power Automate – upozornění a mazání
13. Kontrolní seznam před spuštěním

---

## 0. Než začneš – GDPR a školní řád

Aplikace zapisuje, kdo a kdy šel z hodiny na toaletu. To jsou osobní údaje nezletilých. Jde to, ale musí to být podložené:

- **Pověřenec pro ochranu osobních údajů** (škola ho mít musí): ukaž mu tenhle návod a kap. 10 v `MEGAPROMPT.md`. Zeptej se, jestli chce posouzení vlivu (DPIA) a jaký právní titul uvede (obvykle ochrana majetku a bezpečnosti žáků).
- **Ředitel:** souhlas a doplnění **školního řádu** (odchody z hodin se zapisují, o přestávkách může být dozor u dveří, záznamy se mažou po 30 dnech).
- **Rodiče a žáci:** informovat předem. Oznámení systému je samo o sobě prevence.
- **Nastavení v aplikaci:** uchování 30 dní, uklízečka nevidí jména (jen počet). Obojí jde změnit ve Správě → Číselníky a pravidla → Obecné.

Co aplikace záměrně **nedělá**: neukládá zdravotní údaje, nezakazuje žákům odejít (jen hlídá „venku jeden“ a učitel smí výjimku), nemá žebříček „kdo chodí nejčastěji“.

---

## 1. Vyzkoušej demo

Dokud je v `js/config.js` místo `clientId` text `DOPLNIT`, aplikace běží v demo režimu: smyšlená data, přihlášení výběrem role, nic se nikam neposílá.

Otevři `index.html` přes webový server (stačí nahrát na GitHub Pages – krok 2) a projdi role: správce, vedení, učitelka na dozoru, uklízečka, tablet. V menu pod jménem jde zapnout **Simulovat výpadek sítě**.

V ostrém provozu jde demo kdykoli otevřít adresou s `?demo=1` (třeba na poradě), aniž by se cokoli dotklo skutečných dat.

---

## 2. Nahraj aplikaci na GitHub Pages

1. Na github.com založ repozitář `zachody` (veřejný – v kódu nejsou žádná hesla ani data).
2. Nahraj do něj obsah složky aplikace (soubory `index.html`, `styles.css`, `sw.js`, `manifest.webmanifest` a složky `js`, `icons`).
3. **Settings → Pages → Branch: main, složka / (root) → Save.**
4. Za minutu běží na `https://tadeasfirich.github.io/zachody/`.

✔ Na té adrese vidíš přihlašovací obrazovku s demo rolemi.

> Data na GitHubu nejsou. Je tam jen aplikace; všechno, co se zapíše, jde do školního SharePointu.

---

## 3. Skupiny v Microsoft 365

Role se určují podle skupin. Mapování je v `config.js` (`roleGroups`), takže můžeš použít i skupiny, které už máš.

| Role | Skupina (výchozí název v config.js) | Kdo v ní je |
|---|---|---|
| správce | `Záchody Správci` | ty |
| vedení | `Vedení` (už existuje) | vedení, včetně pana Švarce |
| učitel | `Kantoři`, `Asistentky` (už existují) | všichni, kdo dělají dozor |
| úklid | `Záchody Úklid` | uklízečky (ne celá skupina Zaměstnanci – jsou v ní i kuchařky) |
| učebna | `Záchody Učebny` | účty tabletů (krok 4) |

Založení nové skupiny:

1. **admin.microsoft.com → Týmy a skupiny → Aktivní týmy a skupiny → Přidat skupinu.**
2. Typ: **Zabezpečení** (Security) – nevytvoří zbytečný tým ani schránku. (Microsoft 365 skupina funguje taky.)
3. Název přesně podle tabulky, přidej členy, ulož.

Pokud se tvoje existující skupiny jmenují jinak (např. „vedeni“), uprav názvy v `config.js`. Na velikosti písmen a diakritice nezáleží.

✔ Ve skupině `Záchody Správci` jsi ty.

---

## 4. Účty pro tablety v učebnách

Každá učebna s tabletem dostane vlastní účet (tablet je přihlášený pořád, i když se střídají učitelé).

1. **admin.microsoft.com → Uživatelé → Aktivní uživatelé → Přidat uživatele.**
2. Jméno např. `Učebna 8.A`, e-mail `ucebna.8a@skola.libcice.cz`, silné heslo (zapiš si ho).
3. Licence: stačí bezplatná **Office 365 A1** (potřebuje SharePoint).
4. Přidej účet do skupiny `Záchody Učebny`.
5. Doporučení: v Entra ID vypni pro tyto účty vícefázové ověřování jen pokud to tvoje pravidla dovolují; jinak přihlas tablet jednou s MFA a nech ho přihlášený.

Opakuj pro každou učebnu (19 tříd + odborné učebny). Hromadně jde přes **Uživatelé → Přidat více uživatelů** a CSV.

✔ Účty existují a jsou ve skupině učeben.

---

## 5. SharePoint web

1. **admin.microsoft.com → SharePoint → Weby → Aktivní weby → Vytvořit.**
2. Zvol **Další možnosti → Týmový web bez skupiny Microsoft 365** (nebo Komunikační web).
3. Název `Záchody`, adresa `/sites/Zachody`, vlastník ty.
4. Na novém webu: **ozubené kolo → Oprávnění webu → Upřesnit nastavení oprávnění → Udělit oprávnění:**
   - `Záchody Správci` → **Úplné řízení**
   - `Vedení`, `Kantoři`, `Asistentky`, `Záchody Úklid`, `Záchody Učebny` → **Úpravy**
5. Zkontroluj, že tam **nejsou** žáci ani skupina „Všichni kromě externích uživatelů“.

✔ Web `https://<tvuj-tenant>.sharepoint.com/sites/Zachody` existuje a žáci k němu nemají přístup.

---

## 6. Registrace aplikace v Entra ID

1. **entra.microsoft.com → Identita → Aplikace → Registrace aplikací → Nová registrace.**
2. Název: `Záchody`. Podporované typy účtů: **Jen účty v tomto adresáři organizace**.
3. Identifikátor URI přesměrování: platforma **Jednostránková aplikace (SPA)**, adresa přesně `https://tadeasfirich.github.io/zachody/` (s lomítkem na konci).
4. **Zaregistrovat.** Na stránce Přehled si zkopíruj:
   - **ID aplikace (klienta)** → `clientId`
   - **ID adresáře (tenanta)** → `tenantId`
5. **Oprávnění API → Přidat oprávnění → Microsoft Graph → Delegovaná oprávnění:**
   - `User.Read`
   - `GroupMember.Read.All` (aplikace zjistí, ve kterých skupinách uživatel je)
   - `Sites.ReadWrite.All` (čtení a zápis seznamů)
   - `Sites.Manage.All` (jen pro jednorázové založení seznamů v kroku 8)
6. **Udělit souhlas správce pro …** (tlačítko nahoře) → Ano. U všech oprávnění musí svítit zelená fajfka.

✔ Máš zkopírované dvě ID a souhlas správce je udělený.

> Bezpečnost: delegovaná oprávnění znamenají, že aplikace smí jen to, co smí přihlášený uživatel. Data chrání oprávnění SharePoint webu z kroku 5, ne skrytí tlačítek v aplikaci. Přísnější varianta (`Sites.Selected` jen na jeden web) jde nastavit později – viz `ROZHODNUTI.md`.

---

## 7. Vyplň `config.js`

V souboru `js/config.js` doplň:

```js
msal: {
  clientId: 'sem ID aplikace',
  tenantId: 'sem ID adresáře',
},
sharepoint: {
  hostname: 'tvujtenant.sharepoint.com',
  sitePath: '/sites/Zachody',
  photoFolder: 'FotkyIncidentu',
},
```

a zkontroluj `roleGroups` (krok 3). Nahraj změnu na GitHub. V `sw.js` zvyš `VERSION` (např. `zachody-v2`), ať si zařízení stáhnou novou verzi.

✔ Na adrese aplikace je tlačítko **Přihlásit přes Microsoft**.

---

## 8. Založ seznamy (tlačítko v aplikaci)

1. Přihlas se svým účtem. Uvidíš Správu.
2. **Správa → Instalace SharePointu → Zkontrolovat a založit seznamy.** Microsoft se jednou zeptá na oprávnění.
3. V logu uvidíš zakládání seznamů: Toalety, Ucebny, Tridy, Zaci, Zvoneni, PlanDozoru, RozpisKontrol, Rozvrh, DnyBezProvozu, ZvysenyDohled, Nastaveni, Relace, Navstevy, Kontroly, Incidenty, SlotyKontrol. Výchozí toalety (6), zvonění a rozpis se doplní samy.
4. **Ručně přidej index na sloupec Title** v seznamech `Navstevy`, `Kontroly`, `Incidenty`, `Relace`: v SharePointu otevři seznam → **ozubené kolo → Nastavení seznamu → Indexované sloupce → Vytvořit nový index → Název (Title)**. Bez toho by po pár tisících záznamech začalo hledání selhávat.

Tlačítko jde spustit znovu kdykoli – existující data nemění, jen doplní, co chybí.

✔ V SharePoint webu vidíš 16 seznamů.

---

## 9. Naplň číselníky

V aplikaci **Správa → Číselníky a pravidla**:

1. **Zvonění** – skutečné časy hodin (výchozí jsou 8:00–8:45, 8:55–9:40, …).
2. **Učebny a tablety** – každá učebna: název, patro, e-mail tabletu z kroku 4, kolik žáků smí být venku (1), případně PIN pro nastavení tabletu.
3. **Třídy** – založí se samy při importu žáků.
4. **Žáci a import** – ve Škole OnLine vyexportuj seznam žáků (jméno, příjmení, třída, pohlaví) do Excelu a nahraj ho. Aplikace ukáže, kdo přibyl, kdo je přeřazený a kdo odešel, a teprve pak uloží. V září import zopakuj.
5. **Rozvrh učeben** (Správa → Rozvrh učeben, umí i vedení) – u kmenových učeben stačí „Rychlé vyplnění“ třídou, pak oprav hodiny, kdy je třída jinde. Podle rozvrhu tablet sám spouští hodiny.
6. **Plán dozorů** – kdo má o které přestávce dozor na kterém patře. Učitele do nabídky přidáš dole (jméno + e-mail).
7. **Rozpis kontrol** – které kontroly jsou povinné. Výchozí: na konci každé přestávky povinná, na začátku nepovinná.
8. **Dny bez provozu** – prázdniny a volna.

✔ Ve Správě → Plnění kontrol se objevují očekávané kontroly.

---

## 10. QR štítky

**Správa → QR štítky na dveře → Tisknout.** Na A4 je 6 štítků. Rozstříhej, dej do průhledného obalu a nalep na dveře zvenku (ve výšce očí dospělého).

Učitel naskenuje kód fotoaparátem → otevře se kontrola té toalety → dvě ťuknutí.

---

## 11. Tablety ve třídách

Na každém tabletu:

1. Otevři v Chrome (Android) nebo Safari (iPad) adresu aplikace.
2. **Nainstaluj:** Chrome → ⋮ → Instalovat aplikaci; Safari → Sdílet → Přidat na plochu.
3. Spusť ikonu z plochy a přihlas se **účtem učebny**. Tablet zůstane přihlášený.
4. **Uzamkni na jednu aplikaci**, ať se žáci nedostanou jinam:
   - Android: Nastavení → Zabezpečení → Připnutí aplikace; pak v přehledu aplikací připni Záchody.
   - iPad: Nastavení → Zpřístupnění → Řízený přístup; v aplikaci třikrát stiskni boční tlačítko.
5. Vypni uspávání obrazovky (nebo nastav co nejdelší) a dej tablet na nabíječku na místo, kam učitel dohlédne z katedry.

Nastavení tabletu (změna třídy, ukončení hodiny, odhlášení) je pod kolečkem vpravo nahoře – **podržet 2 sekundy**.

Učitelé a uklízečka si aplikaci nainstalují na telefon stejně (krok 2) a přihlásí se svým účtem.

---

## 12. Power Automate – upozornění a mazání

Tři toky na **make.powerautomate.com** (přihlas se svým účtem). Používají jen standardní konektory SharePoint, Office 365 Outlook a Microsoft Teams, které jsou ve školních licencích. Kdyby u akce svítilo „Premium“, napiš mi.

Na zkopírování opakovaně potřebuješ adresu webu: `https://tvujtenant.sharepoint.com/sites/Zachody`.

### Tok 1 – Chybějící kontrola (vedení + dozor)

Hlídá povinné kontroly. Když dozor do konce okna nic nezapíše, přijde e-mail a zpráva do Teams (na telefonu jako push notifikace).

1. **Vytvořit → Plánovaný cloudový tok.** Název `Záchody – chybějící kontrola`. Opakovat každých **5 minut**. Vytvořit.
2. Klikni na trigger **Opakování** → Zobrazit upřesňující možnosti:
   - Časové pásmo: **(UTC+01:00) Bělehrad, Bratislava, Budapešť, Lublaň, Praha**
   - Ve tyto dny: po–pá
   - V tyto hodiny: 7, 8, 9, 10, 11, 12, 13, 14, 15
3. **+ Nový krok → Compose (Vytvořit)**, přejmenuj na `ted` (minuta dne). Do Vstupů vlož výraz (záložka Výraz / fx):
   `add(mul(int(convertTimeZone(utcNow(), 'UTC', 'Central Europe Standard Time', 'HH')), 60), int(convertTimeZone(utcNow(), 'UTC', 'Central Europe Standard Time', 'mm')))`
4. Další **Compose** `pred5`: `sub(outputs('ted'), 5)`
5. Další **Compose** `den`: `if(equals(dayOfWeek(convertTimeZone(utcNow(), 'UTC', 'Central Europe Standard Time')), 0), 7, dayOfWeek(convertTimeZone(utcNow(), 'UTC', 'Central Europe Standard Time')))`
6. Další **Compose** `dnes`: `convertTimeZone(utcNow(), 'UTC', 'Central Europe Standard Time', 'yyyy-MM-dd')`
7. **SharePoint → Získat položky (Get items)**, přejmenuj na `volno`: web Záchody, seznam `DnyBezProvozu`, Dotaz filtru: `Datum eq '@{outputs('dnes')}'`
8. **Podmínka:** `length(body('volno')?['value'])` je rovno `0`. Všechno další patří do větve **Ano**.
9. **SharePoint → Získat položky**, přejmenuj na `sloty`: seznam `SlotyKontrol`, Dotaz filtru:
   `DenTydne eq @{outputs('den')} and MinDo gt @{outputs('pred5')} and MinDo le @{outputs('ted')}`
10. **Použít pro každou** (Apply to each) na `value` ze `sloty`. Uvnitř:
    1. **Compose** `od`: `convertToUtc(concat(outputs('dnes'), 'T', items('Použít_pro_každou')?['CasOd'], ':00'), 'Central Europe Standard Time')`
       (časy jsou uložené jako „08:52“; název smyčky v `items('…')` musí sedět s tvým – Power Automate ho doplní, když sloupec vložíš přes „Dynamický obsah“.)
    2. **Compose** `do`: totéž s `CasDo`.
    3. **SharePoint → Získat položky** `kontroly`: seznam `Kontroly`, Dotaz filtru:
       `Toaleta eq '@{items('Použít_pro_každou')?['Toaleta']}' and Cas ge '@{outputs('od')}' and Cas le '@{outputs('do')}'`
    4. **Podmínka:** `length(body('kontroly')?['value'])` je rovno `0`. Ve větvi **Ano**:
       - **Office 365 Outlook → Odeslat e-mail (V2):**
         Komu: e-mail skupiny vedení (nebo přímo pan Švarc), Kopie: `Ucitel` ze slotu.
         Předmět: `Chybí kontrola WC: @{items('Použít_pro_každou')?['Toaleta']}, @{items('Použít_pro_každou')?['Prestavka']}. přestávka`
         Text: `Do @{items('Použít_pro_každou')?['CasDo']} nikdo nezapsal kontrolu toalety @{items('Použít_pro_každou')?['Toaleta']}. Dozor podle plánu: @{items('Použít_pro_každou')?['Jmeno']}.`
       - **Microsoft Teams → Publikovat zprávu v chatu nebo kanálu:** Publikovat jako **Flow bot**, Publikovat do **Chat s Flow botem**, Příjemce: `Ucitel` ze slotu, Zpráva jako výše.
       - Stejnou akci Teams přidej ještě jednou s příjemcem pan Švarc (případně pro každého člena vedení zvlášť).
11. **Uložit → Test → Ručně.** Mimo vyučování proběhne naprázdno.

Ve fázi 1 je seznam `SlotyKontrol` prázdný (upozornění vypnutá v Obecném nastavení), takže tok nic neposílá. Až upozornění zapneš, aplikace sloty doplní. Sloty v seznamu `SlotyKontrol` přepočítává aplikace sama, kdykoli uložíš zvonění, plán dozorů, rozpis nebo toalety.

### Tok 2 – Nový incident (vedení)

1. **Vytvořit → Automatizovaný cloudový tok**, trigger **SharePoint → Při vytvoření položky**, web Záchody, seznam `Incidenty`.
2. **Získat položky** `upozorneni`: seznam `Nastaveni`, filtr `Title eq 'upozorneni'`. Pak **Podmínka**: `first(body('upozorneni')?['value'])?['Hodnota']` je rovno `true`. Všechno další patří do větve **Ano** – ve fázi 1 (upozornění vypnutá) tok nic nepošle.
3. **Odeslat e-mail (V2)** vedení:
   Předmět: `Škoda na WC: @{triggerOutputs()?['body/Toaleta']} – @{triggerOutputs()?['body/Kategorie']}`
   Text: `Nahlásil(a) @{triggerOutputs()?['body/Jmeno']}. Detail: https://tadeasfirich.github.io/zachody/#/sprava/incidenty/@{triggerOutputs()?['body/Title']}`
4. **Teams – Flow bot** stejnou zprávu panu Švarcovi.

### Tok 3 – Noční mazání starých záznamů

1. **Plánovaný cloudový tok**, každý den ve 2:00 (časové pásmo Praha).
2. **Získat položky** `nastaveni`: seznam `Nastaveni`, filtr `Title eq 'retenceDni'`.
3. **Compose** `limit`: `addDays(utcNow(), mul(-1, int(first(body('nastaveni')?['value'])?['Hodnota'])))`
4. **Získat položky** `stare`: seznam `Navstevy`, filtr `CasOd lt '@{outputs('limit')}'`. V Nastavení akce zapni **Stránkování** a limit 5000.
5. **Filtrovat pole** (Data Operation → Filter array) z `value`: podmínka `item()?['Incident']` je rovno prázdnému řetězci – v rozšířeném režimu `@empty(item()?['Incident'])`.
6. **Použít pro každou** na výsledek filtru → **SharePoint → Odstranit položku**, seznam `Navstevy`, ID: `ID`.
7. Totéž pro seznam `Relace` se sloupcem `Zacatek` (bez filtru incidentů).

Odchody, které spadají do okna incidentu, aplikace při nahlášení škody označí (sloupec `Incident`), takže je tok nesmaže. Smažou se ručně ve Správě → Data, až incidenty na konci roku uzavřeš a smažeš.

---

## 13. Kontrolní seznam před spuštěním

- [ ] Pověřenec a ředitel souhlasí, školní řád je doplněný, rodiče informovaní.
- [ ] Žáci nemají přístup na SharePoint web.
- [ ] Každý tablet: přihlášený účtem učebny, učebna je v číselníku, uzamčený na jednu aplikaci.
- [ ] Žáci naimportovaní, všichni mají typ toalety.
- [ ] Zvonění, plán dozorů a rozpis odpovídají skutečnosti.
- [ ] QR štítky jsou na dveřích; aspoň jeden učitel zkusil naskenovat a zapsat.
- [ ] Toky 1–3 jsou zapnuté; zkušební upozornění dorazilo panu Švarcovi do Teams.
- [ ] Učitelé dostali README (jedna strana) a na poradě demo (`?demo=1`).
- [ ] Za 14 dní: Správa → Plnění kontrol. Bez pravidelných kontrol jsou okna široká a analýza nic neřekne.
