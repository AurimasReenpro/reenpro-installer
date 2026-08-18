# Medžiagų eiga: nuo žiniaraščio iki nurašymo

Sprendimas priimtas 2026-08-17 pagal B2C proceso diagramą. Šis failas yra
šaltinis — jei kas nors nesutampa su kodu, teisus šis failas arba jį reikia
atnaujinti.

## Ribos: kas lieka kitur

**Asana lieka pre-sale daliai.** Programos eiga prasideda ties „objektas
sukurtas". Užduočių valdymo programoje **nekuriame** — kitaip turėsime dvi
sistemas tam pačiam. Ilgainiui, jei eiga pasiteisins, Asana gali trauktis, bet
tai ne šio darbo tikslas.

**Rivilė lieka apskaitos tiesa.** Ir čia svarbiausias šio dokumento įspėjimas.

Nusprendus, kad sandėlys seka likučius programoje, atsiranda **du likučių
šaltiniai** — programa ir Rivilė. Jie neišvengiamai prasilenks, o tada niekas
nežinos, kuriuo tikėti.

Todėl riba brėžiama taip:

| | Šaltinis |
|---|---|
| Kiek fiziškai yra sandėlyje, apskaitine prasme | **Rivilė** |
| Kas rezervuota ir išduota kuriam objektui | **Programa** |
| Kiek sunaudota pagal faktą | **Programa** |
| Nurašymas | **Rivilė**, pagal programos eksportą |

Programos likutis yra **darbinis**, ne apskaitinis. Jis padeda sandėliui
atsakyti greitai, bet galutinį „turime" patvirtina žmogus — taip, kaip ir
dabar. Tai ne trūkumas, o sąmoningas sprendimas: kitaip reikėtų pilnos
atsargų apskaitos su inventorizacijomis ir suderinimais, o tai atskira
sistema, ne šio projekto dalis.

**Gyvo sinchronizavimo su Rivile nedarome.** Suderinimas — per nurašymo
eksportą.

## Ko šiandien nėra (patikrinta bazėje 2026-08-17)

Medžiagoms nėra beveik nieko, tad tai statyba, ne praplėtimas:

- Objekto įranga guli `sites.equipment_details` **jsonb** lauke. Atskiros
  lentelės nėra, tad nėra nei kiekių, nei ryšio su katalogu, nei sumavimo.
- `equipment_catalog` turi tik `category, brand, model, specifications,
  capacity_kwh`. **Nei mato vieneto, nei kodo.** Tai įrangos modelių sąrašas;
  kabeliui ar spaustukams netinka.
- `site_extra_materials.name` yra **laisvas tekstas**, nesusietas su niekuo.
- Atsargų judėjimo nėra jokio.

## Duomenų modelis

### Katalogas — vienas, ne du

Praplečiamas `equipment_catalog`, o ne kuriamas antras sąrašas: du katalogai
reikštų, kad niekas nežino, į kurį vesti.

Pridedama:

- **`unit`** (vnt., m, kg) — be jo kiekiai beprasmiai
- **`code`** — Rivilės prekės kodas
- `kind` — `equipment` | `material`
- `is_active`

`code` yra pigiausias ir svarbiausias laukas visame projekte. Be jo
perdavimas buhalterijai amžinai liks rankinis; su juo eksportas įkeliamas
tiesiai.

Katalogas užpildytas 2026-08-18 iš Rivilės — 341 prekė. Kas ten svarbaus ir ko
NEDAROME (sinchronizavimo, `system` stulpelio), žr. skyrių
„Katalogas užpildytas iš Rivilės".

### Žiniaraštis

**`site_material_lists`** — antraštė: objektas, būsena, versija, kūrėjas,
šablonas, iš kurio sugeneruota.

**`site_material_lines`** — `catalog_item_id`, `unit` (momentinė kopija),
`qty_planned`, `qty_issued`, `qty_actual`, `qty_returned`, pastaba.

Planas ir faktas **vienoje eilutėje**, ne dviejose lentelėse. Visa vertė yra
nuokrypis; atskyrus jį reikėtų kaskart skaičiuoti per jungimą, o duomenys
prasilenktų. Montuotojo pridėta medžiaga, kurios plane nebuvo, yra eilutė su
`qty_planned = 0` — todėl `site_extra_materials` atskirai nebereikia.

`unit` kopijuojamas į eilutę sąmoningai: pakeitus katalogą, seni žiniaraščiai
turi likti tokie, kokie buvo pasirašyti.

### `qty_planned = NULL` nėra tas pats, kas `0`

| Reikšmė | Prasmė |
|---|---|
| `0` | planuota nenaudoti; montuotojas pridėjo pats |
| `NULL` | **reikės, bet kiek — dar nežinome** |
| skaičius | suplanuotas kiekis |

Dalies medžiagų kiekio iš anksto suvesti neįmanoma. Tipinis pavyzdys — **DC
kabelis**: kiek jo reikės, paaiškėja tik ant stogo. Inžinierius įrašo eilutę
be kiekio, ir tai teisinga būsena, ne neužbaigtas darbas.

Iš to seka dvi taisyklės:

- **Pateikti žiniaraštį su tuščiais kiekiais galima.** Tai normalu.
- **Užbaigti fakto su tuščiais `qty_actual` negalima.** Būtent tokioms
  eilutėms faktas ir yra vienintelis kiekio šaltinis, tad `faktas_suvestas`
  perėjimas jų reikalauja visose eilutėse — įskaitant tas, kur planas buvo
  tuščias.

Tai kartu paaiškina, kodėl `qty_issued` ir `qty_actual` yra atskiri stulpeliai.
Kabelio sandėlys išduoda **visą ritę**, o sunaudojami 80 metrų. Tada:

```
qty_issued   = 300   (ritė)
qty_actual   =  80   (sunaudota)
qty_returned = 220   (grąžinta į sandėlį)
```

Sudėjus išduota ir sunaudota į vieną stulpelį, nurašytum visą ritę — ir
nurašymo aktas, keliaujantis buhalterijai, būtų neteisingas.

### Išduoti galima daugiau, nei suplanuota

Patvirtinta 2026-08-17: jei sandėlyje yra ritė, jos nepjaustysime iki
nelogiško kiekio — išduodama visa. Todėl `qty_issued > qty_planned` yra
**normalu, ne klaida**, ir jokios patikros to riboti neturi.

Grąžinimo automatiškai **neįrašinėjame**. Prielaida „tikriausiai parvežė"
meluotų tyliai, o tyliai gendantis skaičius yra blogiausia, kas gali nutikti.
Kol sandėlys neužfiksavo, likutis kabo prie objekto ir matosi sąraše.

**`site_material_events`** — perėjimų žurnalas: iš kokios būsenos, į kokią,
kas, kada, komentaras. **Niekada nekeičiamas, tik pildomas.**

„Rangos vadovas pasirašė" yra neištrinama eilutė, o ne `signed = true` laukas,
kurį galima perrašyti. Parašas be pėdsako nėra parašas.

## Būsenos

```
rengiamas → pateiktas → [trūksta ⇄] → patvirtintas
    → išduota → faktas_suvestas → priimta → nurašyta
```

| Perėjimas | Kas daro | Kam praneša |
|---|---|---|
| → pateiktas | inžinierius | sandėlys, tiekimas |
| → trūksta (su laukiama data) | tiekimas | projektų vadovas |
| → patvirtintas | sandėlys | projektų vadovas |
| → išduota | sandėlys | montuotojai |
| → faktas_suvestas | montuotojai | rangos vadovas |
| → priimta | rangos vadovas | buhalterija |
| → nurašyta | buhalterija arba eksportas | — |

### Trys taisyklės, be kurių eiga neveiks

**1. Po `pateiktas` žiniaraštis nekeičiamas.** Jei inžinierius jį pataisytų po
sandėlio patvirtinimo, patvirtinimas nieko nebereikštų. Taisymas kuria **naują
versiją** su nauju patvirtinimu. Tai dažniausia tokių sistemų klaida.

**2. `patvirtintas` blokuoja planavimą.** Kol medžiagos nepatvirtintos,
montavimo suplanuoti negalima. Būtent tai pakeičia Outlook patvirtinimą — ir
tai didžiausia automatizavimo nauda visoje grandinėje.

**3. Fakto suvedimas veikia neprisijungus.** Montuotojas veda ant stogo.
Programoje jau yra `photoOutbox` su IndexedDB eile — medžiagos turi eiti tuo
pačiu keliu. Padarius paprasta užklausa, duomenys tyliai dings, ir tai
paaiškės ne iš klaidos, o iš nesutampančio likučio po mėnesio.

## Atsargų programoje NĖRA

Svarbiausias ir maloniausias sprendimas visame dokumente.

**Likučius seka Rivilė. Mūsų programa tik užfiksuoja, ar sandėlys patvirtino,
kad medžiagų turime.** Sandėlininkas žiūri į Rivilę, o programoje paspaudžia
„patvirtinu" arba „trūksta".

Ankstesnė šio dokumento redakcija numatė `stock_movements` žurnalą su
rezervacijomis, gavimais ir inventorizacijomis. **To nebereikia nė vieno.**

Kodėl tai teisinga, o ne tingu: vakar buvo įspėta, kad du likučių šaltiniai
neišvengiamai prasilenks ir niekas nežinos, kuriuo tikėti. Nusprendus, kad
šaltinis vienas, rizika dingsta kartu su visa posisteme. Mažiau kodo ir
mažiau melo — retas derinys.

Kartu atkrenta ir klausimas apie prekių gavimo fiksavimą: jei likutį veda
Rivilė, mūsų programai nebėra ko vesti į minusą.

### Ko sąmoningai NEMODELIUOJAME

- Likučių, rezervacijų, inventorizacijų — **Rivilė**.
- Tiekimo pirkimų: užsakymų, tiekėjų, sąskaitų, pristatymo terminų. Užsakyta
  iš anksto — tiekimas nuperka, medžiaga išduodama įprasta tvarka.
- Sandėlio vietų. Sandėlis vienas, automobiliuose likučių nesekame.

Tiekimo darbas eigoje vis tiek matomas — per `trūksta` būseną su laukiama
data. Fiksuojamas **rezultatas ir terminas**, ne pats pirkimo procesas.

### Ką programa vis dėlto žino apie kiekius

Tik tai, kas susiję su **konkrečiu objektu**, ne su sandėliu:

| Stulpelis | Prasmė |
|---|---|
| `qty_planned` | kiek numatyta (gali būti `NULL`) |
| `qty_issued` | kiek sandėlys išdavė šiam objektui |
| `qty_actual` | kiek montuotojas sunaudojo |
| `qty_returned` | kiek grąžinta į sandėlį |

Tai objekto duomenys, ne atsargų apskaita, tad su Rivile jie nesivaržo.

Iš jų vis tiek gaunasi tas naudingas rodinys **„išduota ir dar negrįžo"**:

```
qty_issued − qty_actual − qty_returned
```

Ritės atveju: išduota 300, sunaudota 80, grąžinta 220 → nulis. Kol grąžinimas
neužfiksuotas, likutis kabo prie objekto ir matosi. Automatiškai jo
neįrašinėjame — prielaida „turbūt parvežė" meluotų tyliai.

## Kai sunaudota ne tai, kas planuota

Trys skirtingi atvejai, ir tik pirmi du yra ta pati sąvoka:

**1. Sunaudota daugiau, nei planuota.** Plane 50 m kabelio, faktas 65 m.
Tiesiog `qty_actual > qty_planned`. Nieko naujo nereikia.

**2. Sunaudota kataloginė medžiaga, kurios plane nebuvo.** Eilutė su
`qty_planned = 0`. Medžiaga iš sandėlio, tad nurašoma įprastai.

**3. Nupirkta parduotuvėje.** **Tai ne medžiagos sunaudojimas, o išlaida su
dokumentu**, ir maišyti su pirmais dviem negalima:

| | Iš sandėlio | Pirkta parduotuvėje |
|---|---|---|
| Likutis | mažėja | **neliečiamas** — sandėlyje niekada nebuvo |
| Apskaitoje | nurašymas | **išlaida** |
| Reikia | kiekio | kiekio, **kainos ir čekio** |
| Katalogas | privalomas | gali nebūti |

Sudėjus juos į vieną lentelę, sugadinamas ir likutis (nurašoma tai, ko
sandėlyje nebuvo), ir savikaina (pirkinys dingsta iš išlaidų).

### `site_purchases`

`site_id`, `name` (laisvas tekstas), `catalog_item_id` (neprivalomas),
`quantity`, `unit`, `price`, `vendor` (neprivalomas), `receipt_photo_id`,
`created_by`, `created_at`.

**Visi pirkiniai — įmonės sąskaita.** Montuotojas savo pinigais įrangos
neperka; tai įmonės taisyklė, ne techninis apribojimas. Montuotojas turi
**įmonės kortelę**, tad pirkti objekte gali pats.

**`site_purchases` skirtas TIK šiam atvejui:** montuotojas objekte nuperka
trūkstamą detalę įmonės kortele. Prekė į sandėlį nepatenka niekada, tad
sandėlio eilutėse jos nėra.

Vadinasi, mobiliojoje dalyje pirkinio forma **reikalinga** — su čekio
nuotrauka, einančia per tą patį `photoOutbox` kelią kaip ir visos kitos.

Todėl **`paid_by` lauko nėra**, nors ankstesnėje šio dokumento redakcijoje jis
buvo numatytas. Sąmoningas sprendimas: laukas su pasirinkimu „savo / įmonės"
tokį pirkimą įteisintų ir po metų turėtume duomenų, kurių pagal taisyklę
neturėtų būti. Kompensacijų apskaitos taip pat nereikia.

**Čekio nuotrauka vis tiek privaloma** — bet ne kompensacijai, o buhalterijai:
be dokumento išlaidos nenurašysi.

**Čekio nuotrauka privaloma.** Be jos tai ne išlaida, o teiginys.

`receipt_photo_id` rodo į esamą **`photos`** lentelę. Tai sąmoningas
pakartotinis panaudojimas: sunkiausia dalis — įkėlimas neprisijungus su
pakartotiniais bandymais (`photoOutbox`) — jau parašyta ir išbandyta lauke.
Čekis yra tokia pat nuotrauka, tik su kita paskirtimi, ir jam savaime
pritaikomos tos pačios taisyklės, kurias sutvarkėme: montuotojas netrina
svetimų, biuras mato bet nekeičia.

Jei prekė vis dėlto pirma pateko į sandėlį, tai nebe pirkinys objektui, o
įprastas išdavimas — ir Rivilėje ji atsiduria kaip visos kitos.

Žiniaraštyje pirkiniai rodomi **atskira dalimi** („Pirkta objektui"), ne
sumaišyti su sandėlio eilutėmis — buhalterijai tai du skirtingi dokumentai.

**Pasikartojantys pirkiniai.** Jei ta pati prekė perkama nuolat, ji turi
atsidurti kataloge. Bet **automatiškai nekuriama** — kitaip katalogas per
mėnesį taps šiukšlynu. Inžinierius ar sandėlis mato pasiūlymų sąrašą ir
nusprendžia pats.

## Priėmimas: priima arba grąžina

Rangos vadovas **fakto neredaguoja**. Du veiksmai:

- **Priima** → `priimta`, keliauja buhalterijai.
- **Grąžina** → `grazinta_taisyti`, montuotojas gauna pranešimą.

Redagavimo sąmoningai nėra: jei vadovas pats pataisytų kiekius, įrodymas
nustotų būti montuotojo, ir dingtų atsakomybė. Grąžinimas išlaiko abi puses
atsakingas.

**Grąžinant priežastis privaloma.** Be jos montuotojas nežino, ką taisyti, ir
tas pats žiniaraštis grįžta antrą kartą. Priežastis lieka
`site_material_events` žurnale, tad matyti ir kiek kartų buvo grąžinta.

## Šablonai pagal sistemos tipą

**`material_templates`** — pavadinimas, `site_type`, `system_type`, `is_active`.

**`material_template_lines`** — `catalog_item_id`, `qty`, **`basis`**.

`basis` yra esminis: dalis medžiagų fiksuotos, dalis auga su sistema.

| `basis` | Kiekis skaičiuojamas |
|---|---|
| `fixed` | tiek, kiek nurodyta |
| `per_kwp` | × objekto kWp |
| `per_panel` | × modulių skaičius |
| `per_inverter` | × inverterių skaičius |

Be to šablonas duotų pradinį sąrašą, kurį vis tiek tektų taisyti ranka —
kabelio 5 kW ir 15 kW objektui reikia skirtingai. Su `basis` šablonas
sugeneruoja beveik galutinį žiniaraštį, ir inžinieriui lieka tik peržiūrėti.

Sugeneravus kiekiai **atsiejami** nuo šablono: vėlesnis šablono keitimas senų
žiniaraščių neliečia.

## Vaidmenys

Diagramoje jų septyni, bet **ne visiems reikia paskyros**. Kiekvienas vaidmuo
kainuoja RLS sudėtingumą, o politikų jau dabar 126.

| Diagramos vaidmuo | Programoje | Pastaba |
|---|---|---|
| B2C PV | `project_manager` | jau yra |
| B2C inžinierius | `engineer` | naujas |
| Sandėlys | `warehouse` | naujas |
| Tiekimas | `supply` | naujas; mažoje įmonėje gali sutapti su sandėliu |
| Rangos vadovas | `site_manager` | jau yra |
| Montuotojai | `installer` | jau yra |
| Buhalterija | **nereikia** | gauna eksportą, ne prieigą |

**Kainas mato:** adminas, rangos vadovas ir buhalterija. Kadangi buhalterija
paskyros neturi, **nurašymo eksportas privalo turėti kainas** — kitaip jai
tektų prašyti jų atskirai, ir eksportas nustotų būti savarankiškas dokumentas.

`can_view_costs()` = `is_admin() OR work_role = 'site_manager'`.

Projektų vadovas ir inžinierius kainų nemato. Jei paaiškės, kad planuojant to
reikia, taisoma **viena funkcija**, ne politikų rinkinys — dėl to predikatai ir
naudojami.

Teisės remiasi `work_role`, ne `role`, ir eina per gebėjimų predikatus
(`can_approve_materials()`, `can_issue_stock()`…), ne per vaidmenų vardus
politikose. Žr. `RLS-PERZIURA.md`.

## Etapai

Ne visa grandinė iš karto.

**1. Katalogas ir žiniaraštis.** `unit`, `code`, eilutės, šablonai su `basis`.
Be eigos. Jau naudinga: inžinierius nustoja dirbti Excelyje.

> **Migracija parašyta ir laukia paleidimo:**
> `supabase/migrations/20260817120000_materials_catalog_and_lists.sql`.
> Ji apima tik schemą ir RLS; sąsaja ir API — kitas žingsnis po jos paleidimo.

**2. Fakto suvedimas mobiliojoje dalyje** su offline eile, kartu su pirkinių
forma ir čekio nuotrauka. **Čia didžiausia grąža** — miršta popierinis
žingsnis „montuotojai ranka pakoreguoja MŽ lape", kur ir dingsta duomenų
kokybė.

**3. Būsenos, perėjimai ir pranešimai.** Outlook išnyksta iš grandinės.

**4. Nurašymo eksportas** su Rivilės kodais (PDF aktas + CSV su kainomis).

Etapų buvo penki: ketvirtasis buvo „atsargos ir rezervacijos", ir jis
**atkrito visas**, likučius palikus Rivilei. Rivilės **neintegruojame** —
eksportas duoda 90 % naudos už 10 % rizikos.

## Atsakyti klausimai (2026-08-17)

- **Sandėlis vienas**, automobiliuose likučių nesekame → `location_id` nereikia.
- **Montuotojas gali suvesti nekatalogines medžiagas**; pirktos parduotuvėje
  eina per `site_purchases` su privaloma čekio nuotrauka.
- **Rangos vadovas priima arba grąžina**, fakto neredaguoja.

Antra dalis (2026-08-17):

- **Kainas mato** adminas, rangos vadovas ir buhalterija (per eksportą).
- **Ne viskas perkama įmonės sąskaita** → `site_purchases.paid_by`.
- **Žiniaraštį galima pateikti be visų kiekių** (DC kabelis), bet faktas
  privalo būti užpildytas visose eilutėse.

Trečia dalis (2026-08-17):

- **Išduoti daugiau, nei suplanuota, galima** — ritės nepjaustome.
- Skirtumas tarp išduota ir sunaudota lieka **atviru likučiu**, kol sandėlys
  užfiksuoja grąžinimą. Automatiškai neįrašinėjame.
- **Montuotojas savo pinigais neperka.** `paid_by` lauko nereikia,
  kompensacijų apskaitos taip pat.

Ketvirta dalis (2026-08-17):

- **Montuotojas turi įmonės kortelę** → `site_purchases` kuria jis,
  mobiliojoje dalyje reikia pirkinio formos su čekiu.
- **Tiekimo pirkimų nemodeliuojame.** Užsakyta iš anksto — išduodama įprasta
  tvarka.
- **Likučius seka Rivilė; programa tik fiksuoja sandėlio patvirtinimą.**
  Tai panaikino visą atsargų posistemę: nebereikia nei `stock_movements`
  žurnalo, nei rezervacijų, nei prekių gavimo fiksavimo, nei viso 4 etapo.

## Katalogas užpildytas iš Rivilės (2026-08-18)

**Sinchronizavimo nebus.** Katalogas užpildytas VIENĄ kartą
(`20260818120000_seed_catalog_from_rivile.sql`, 341 prekė, 19 kategorijų), o
toliau gyvena programoje: prekės pridedamos, taisomos ir trinamos ranka.
Sprendimas naudotojo — kartotinis importas reikštų nuolatinį dviejų sąrašų
derinimą, o Rivilė ir taip lieka apskaitos tiesa.

Tai **atšaukia ankstesnį reikalavimą** importui remtis `code` kaip raktu.
Dalinis unikalumo indeksas lieka, bet dabar jis saugo nuo dublikatų vedant
ranka, o ne nuo pakartotinio įkėlimo.

**Kodai eksporte buvo nukirsti ties 12 simbolių.** Failas buvo spausdinama
ataskaita „Prekių likučiai", ne duomenų eksportas: 29 kodai stovi lygiai ties
riba, keli matomai nutrūkę (`R_LY 4,2X19-`, `R_28X85 WK-D`, `R_M6X25-BI-M`).
Vienkartinei sėklai tai nėra kliūtis — kodas yra nuoroda žmogui, ne jungimo
raktas, — bet **tie 29 kodai bazėje yra neteisingi**, kol jų niekas nepataisė
katalogo kortelėje.

**Trijose eilutėse buvo U+009A** (`R00001889`, `R00001912`, `R00004381`) —
CP1252 baitas raidei „š", likęs šalia teisingai užkoduotos raidės po dvigubo
perkodavimo. Išvalytas prieš įrašant. Jei kada bus importuojama daugiau,
valymas nuo C1 valdymo simbolių privalomas: jie nematomi ir tyliai gadina
pavadinimus bei paiešką.

**`brand` paliktas tuščias, visas pavadinimas — `model` lauke.** Rivilė duoda
vieną eilutę („Kabelis FACAB SOLAR + H1Z2Z2-K 1x70 1kV juodas"); skaidyti ją į
gamintoją ir modelį būtų spėjimas. Klaidingas gamintojas blogiau nei tuščias
laukas, o pavadinimą bet kada galima pataisyti. Todėl sąraše rodomas vienas
stulpelis „Pavadinimas" (`brand` + `model`), o ne du.

**Seni 5 įrašai nesujungti su importuotais.** Keturi turi atitikmenis
(`Sunpower P7 555W` = `P7-555-COM`, `Trina 460W` = `NEG9R.28460`,
`SigenBAT 10.0` = `11130012`), o `Sigenergy TP2` atitinka **du** Rivilės
įrašus — `11010185` (10.0 TP2) ir `11010186` (12.0 TP2), tad kuris, neaišku.
Būtent dėl to vakarykštėje migracijoje liko nesusieta eilutė objekte 3220. Jie
susieti su objektų žiniaraščiais, tad sujungimas yra žmogaus sprendimas
kataloge, ne spėjimas migracijoje.

**Konstrukcijų hierarchija — kategorijomis, ne nauja schema.** Buvo svarstyta
pridėti `system` stulpelį (Enerack, Enzeit, 70xxxx šeima, Eyecatcher — 99 iš
341 prekės). Atsisakyta: dangos tipas (čerpė, trapecija, falcas, plokščias,
žemė) **nėra prekės savybė** — profilis `R705100-3550` tinka kelioms dangoms,
tad stulpelis verstų jį dubliuoti. Dangos tipas gyvena **šablone**, kuris ir
yra komplektacija. Sistemai užtenka kategorijos, o kategorijas galima kurti ir
pervadinti sąsajoje.

### Trynimas: „ištrinti" ir „išjungti" nėra tas pats

`site_material_lines` ir `material_template_lines` ryšiai yra
`ON DELETE RESTRICT`, tad panaudotos prekės bazė ištrinti neleidžia — ir
teisingai: senas žiniaraštis turi likti skaitomas. Sąsaja tikrina panaudojimą
**prieš** trynimą ir pasako skaičių („naudojama 3 žiniaraščio eilutėse"), o
vietoje trynimo siūlo `is_active = false`. Nenaudojama prekė trinama tikrai.

## Laukia 2 etape

Nieko iš katalogo dalies — ji baigta. Toliau: montuotojo fakto suvedimas su
offline eile ir `site_purchases` su čekio nuotrauka.

## Atvirų klausimų nebeliko

Viskas, ko reikia 1 ir 2 etapui, sutarta. Prie likusių sprendimų
(pranešimų kanalai, eksporto formatas Rivilei) grįžtama atitinkamuose
etapuose — jie nekeičia duomenų modelio, tad pradžios neblokuoja.
