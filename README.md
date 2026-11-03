# Záchody

Aplikace pro ZŠ Karla Hašlera Libčice proti ničení školních toalet. Tablety ve třídách zapisují, kdo odešel na toaletu, dozory a úklid zapisují stav toalet. Když se najde škoda, aplikace ukáže, kdo tam byl od poslední kontroly.

## Teď: testovací verze

**Spuštění:** `https://tadeasfirich.github.io/zachody/` (po zapnutí GitHub Pages: Settings → Pages → Branch `main`, složka `/ (root)`).

- **Data jsou jen v prohlížeči** (IndexedDB). Nic se nikam neposílá, žádný SharePoint ani Microsoft přihlášení.
- **Testovací účty pro všechny role:** správce, vedení (pan Švarc, zástupce), čtyři učitelé na dozoru, dvě uklízečky a šest tabletů v učebnách (1.A, 4.A, 7.B, 8.A, 8.B, IT učebna).
- **Přepínání účtů:** tlačítko **Testování** nahoře. Ikona se šipkou u účtu ho otevře v nové záložce.
- **Všechny účty sdílí stejná data.** Co zapíše tablet 8.A, hned vidí učitelka na dozoru i vedení – i ve vedlejší záložce.
- **Testovací čas:** večer ani o víkendu se neučí, tak si v panelu Testování posuň čas třeba na „konec 2. přestávky“. Hodiny pak běží dál.
- **Výpadek sítě** jde nasimulovat v panelu Testování. Zápisy počkají v zařízení a odešlou se po „připojení“.
- **Data:** „Obnovit ukázková data“ vygeneruje 4 týdny provozu (s dvojicí žáků, kterou má analýza najít). „Začít s čistým štítem“ smaže záznamy a nechá žáky a nastavení.

Testovací verze běží, dokud je v `js/config.js` u `clientId` text `DOPLNIT`. Napojení na SharePoint, Microsoft přihlášení a Power Automate popisuje `SETUP.md`.

## Soubory

| Soubor | Co v něm je |
|---|---|
| `index.html`, `styles.css` | stránka a vzhled |
| `js/app.js` | start, přihlášení, přepínač aplikací, směrování |
| `js/views/` | obrazovky: `trida` (tablet), `kontrola`, `dozor` (u dveří), `dnes`, `sprava`, `sprava-nastaveni` |
| `js/logic.js` | okna incidentů, analýza překryvu, plnění kontrol |
| `js/store/demo.js`, `demo-data.js` | testovací úložiště a ukázková data |
| `js/store/sharepoint.js` | ostré úložiště (SharePoint přes Microsoft Graph) |
| `js/demo-panel.js`, `js/demo-clock.js` | panel Testování a testovací čas |
| `docs/MEGAPROMPT.md` | původní zadání |
| `SETUP.md`, `ROZHODNUTI.md` | nastavení ostrého provozu, rozhodnutí při vývoji |

---

# Jak to používat

Aplikace pomáhá zjistit, kdo ničí školní toalety, a hlavně tomu předejít. Funguje jednoduše: **kdo šel na toaletu** zapisují tablety ve třídách a **v jakém stavu toaleta je** zapisují dozory a úklid. Když se najde škoda, aplikace ukáže, kdo tam byl od poslední kontroly.

Přihlášení: tlačítko **Přihlásit přes Microsoft**, školní účet. Co uvidíš, záleží na tvé roli.

---

## Učitel v hodině (tablet ve třídě)

1. **Na začátku hodiny** ukáže tablet „Kdo tu teď je?“. Ťukni svou třídu, u spojených seminářů obě. Pak **Začít hodinu**.
   Když tu hodinu učíš stejně jako minulý týden, stačí **Stejná jako minule**.
2. Žák, který jde na toaletu, **ťukne své jméno → Jdu**. Toaleta se vybere sama podle patra.
3. Když se vrátí, ťukne znovu (nebo na černý pruh nahoře) → **Jsem zpět**.
4. Venku smí být **jen jeden žák**. Výjimku povolíš ťuknutím na „Učitel povoluje výjimku“.
5. Zapomenutý návrat se po 10 minutách uzavře sám.

Nastavení tabletu (jiná třída, konec hodiny) je pod kolečkem vpravo nahoře – **podrž 2 sekundy**.
Žák z jiné třídy (suplování, seminář) se najde dole podle příjmení.

---

## Učitel na dozoru (telefon)

**Kontrola – dvě ťuknutí:**

1. Na konci přestávky naskenuj **QR kód na dveřích** toalety (fotoaparátem telefonu).
2. Ťukni **V pořádku**, nebo **Škoda**.
3. U škody vyber druh, vyfoť (jen místnost, nikdy lidi) a **Nahlásit škodu**. Vedení dostane upozornění.

Co máš dnes zkontrolovat, najdeš v **Moje dozory**. Když kontrolu nestihneš, přijde ti připomínka do Teams.

**Zvýšený dohled (U dveří):** když vedení zapne zvýšený dohled na tvém patře, postav se o přestávce ke dveřím toalety a ťukej každého, kdo vchází: třída → jméno. Rychlejší je napsat první 3 písmena příjmení. Překlep vrátíš tlačítkem **Vrátit**.

Proč na tom záleží: čím častěji se kontroluje, tím kratší je okno mezi „v pořádku“ a „škoda“ a tím méně žáků v něm je.

---

## Uklízečka (telefon)

1. Při úklidu naskenuj QR kód na dveřích, nebo vyber toaletu v seznamu.
2. **V pořádku**, nebo **Škoda** s fotkou.
3. V části **Dnes** vidíš stav všech toalet a dnešní nahlášené škody.

---

## Vedení a správce

Nahoře se přepínáš mezi **Tablet ve třídě**, **Dozor a kontrola** a **Správa**.

- **Přehled** – stav toalet teď, vynechané kontroly, poslední incidenty.
- **Incidenty** – detail škody, fotky, kdo byl v okně, změna stavu, tisk bez jmen pro jednání s rodiči, zapnutí zvýšeného dohledu.
- **Analýza překryvu** – kdo se opakovaně objevuje v oknech víc, než by odpovídalo tomu, jak často na toaletu chodí. **Je to vodítko, ne důkaz** – vždy nejdřív rozhovor se žákem a postup podle školního řádu.
- **Plnění kontrol** – kolik povinných kontrol proběhlo, po dozorech.
- **Statistiky**, **QR štítky** a u správce i **Žáci a import**, **Číselníky a pravidla**, **Data a uchování**.

---

## Bez internetu

Zápisy se uloží v zařízení a odešlou se, až bude síť. Nahoře pak svítí „čeká na odeslání: 3“. Nic nemusíš opakovat.

## Soukromí

Odchody žáků se po 30 dnech mažou, pokud nepatří k žádné škodě. Jména žáků v okně škody vidí vedení, správce a učitel, který škodu nahlásil. Aplikace neukládá žádné zdravotní údaje a nikde neřadí žáky podle toho, jak často chodí na toaletu.

Nastavení provozu: `SETUP.md`. Rozhodnutí při vývoji: `ROZHODNUTI.md`.
