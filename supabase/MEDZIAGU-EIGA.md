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

### Žiniaraštis

**`site_material_lists`** — antraštė: objektas, būsena, versija, kūrėjas,
šablonas, iš kurio sugeneruota.

**`site_material_lines`** — `catalog_item_id`, `unit` (momentinė kopija),
`qty_planned`, `qty_reserved`, `qty_issued`, `qty_actual`, pastaba.

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
qty_issued  = 300   (rite)
qty_actual  =  80   (sunaudota)
grąžinama   = 220   → `return` judėjimas atgal į sandėlį
```

Be atskirų stulpelių nurašytum visą ritę, ir likutis pradėtų meluoti nuo
pirmo objekto.

### Išduoti galima daugiau, nei suplanuota

Patvirtinta 2026-08-17: jei sandėlyje yra ritė, jos nepjaustysime iki
nelogiško kiekio — išduodama visa. Todėl `qty_issued > qty_planned` yra
**normalu, ne klaida**, ir jokios patikros to riboti neturi.

### Likutis, kuris dar negrįžo

Iš to seka spraga, kurią verta įvardyti iš karto. Automobiliuose likučių
nesekame, tad `qty_issued − qty_actual` skirtumas nėra nei sunaudotas, nei
grąžintas — jis kažkur pakeliui.

Sprendimas: tas skirtumas laikomas **atviru likučiu objektui**, kol sandėlys
užfiksuoja `return` judėjimą. Iki tol žurnalas rodo tiesą — „išduota, dar
negrąžinta" — o ne apsimeta, kad ritė jau lentynoje.

Šalutinė nauda: iš to savaime gaunasi sąrašas **„kas išduota ir negrįžo"**,
kurio sandėlys dabar neturi. Tai bene naudingiausias vienas rodinys visoje
atsargų dalyje, ir jis nieko papildomo nekainuoja.

Automatiškai grąžinimo **neįrašinėjame**. Prielaida „tikriausiai parvežė"
sugadintų likutį tyliai, o būtent tyliai gendantis skaičius yra blogiausia,
kas gali nutikti sandėlio apskaitoje.

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

## Atsargos

**Sandėlis vienas.** Automobiliuose likučių nesekame, tad `location_id`
nereikia. Jei kada atsirastų antras sandėlis, laukas pridedamas migracija —
bet dabar jo dėti nėra prasmės.

**`stock_movements`** — judėjimų žurnalas: `catalog_item_id`, `qty` (su
ženklu), `type` (`receipt` | `issue` | `return` | `adjustment` | `stocktake`),
`site_id` (gali būti tuščias), `actor_id`, `created_at`, pastaba.

Likutis skaičiuojamas kaip `SUM(qty)`, **ne laikomas stulpelyje**.

Priežastis praktinė: turint `stock_qty` stulpelį, į klausimą „kodėl skaičius
neteisingas" atsakyti neįmanoma, o lygiagretūs atnaujinimai tyliai praranda
duomenis. Su žurnalu kiekvienas pokytis turi priežastį ir autorių, o likutį
galima perskaičiuoti. Sandėlyje pirmas klausimas visada yra „kas įvyko", ir
žurnalas į jį atsako.

Apimtis maža — sumavimas bus greitas dar daugelį metų. Prireikus pridedamas
momentinis vaizdas.

### Rezervacija atskirai nuo išdavimo

Patvirtinus žiniaraštį medžiagos **rezervuojamos**, o ne išduodamos.
Fiziškai jos dar sandėlyje, bet kitam objektui jau nepažadamos.

```
laisva = turima − rezervuota
```

Tai užkerta kelią klasikinei situacijai: sandėlys patvirtino dviem objektams,
o medžiagų užteko vienam. Pigus laukas, didelė nauda.

Perėjimas `išduota` rezervaciją paverčia išdavimu.

## Kai sunaudota ne tai, kas planuota

Trys skirtingi atvejai, ir tik pirmi du yra ta pati sąvoka:

**1. Sunaudota daugiau, nei planuota.** Plane 50 m kabelio, faktas 65 m.
Tiesiog `qty_actual > qty_planned`. Nieko naujo nereikia.

**2. Sunaudota kataloginė medžiaga, kurios plane nebuvo.** Eilutė su
`qty_planned = 0`. Medžiaga iš sandėlio, tad likutis mažėja įprastai.

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
neperka; tai įmonės taisyklė, ne techninis apribojimas.

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

`stock_movements` pirkinys **neliečia**. Jei prekė vis dėlto pirma pateko į
sandėlį, tai jau `receipt` judėjimas, ne pirkinys objektui.

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
Be eigos ir be atsargų. Jau naudinga: inžinierius nustoja dirbti Excelyje.

**2. Fakto suvedimas mobiliojoje dalyje** su offline eile. **Čia didžiausia
grąža** — miršta popierinis žingsnis „montuotojai ranka pakoreguoja MŽ lape",
kur ir dingsta duomenų kokybė.

**3. Būsenos, perėjimai ir pranešimai.** Outlook išnyksta iš grandinės.

**4. Atsargos ir rezervacijos.**

**5. Nurašymo eksportas** su Rivilės kodais (PDF aktas + CSV).

Rivilės **neintegruojame**. Eksportas duoda 90 % naudos už 10 % rizikos.

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

## Likęs atviras klausimas

**Kas fiziškai perka, kai medžiagos pritrūksta objekte?**

Nusprendus, kad montuotojas savo pinigais neperka, lieka du keliai, ir jie
duoda skirtingus duomenų srautus:

- **Montuotojas turi įmonės kortelę.** Tada `site_purchases` kuria jis, ir
  eilutė iškart pririšama prie objekto — prekė į sandėlį nepatenka niekada.
- **Perka biuras arba sandėlys.** Tada prekė pirmiausia patenka į sandėlį
  (`receipt` judėjimas) ir išduodama įprastai. `site_purchases` tokiu atveju
  montuotojui apskritai nereikalingas.

Nuo to priklauso, ar mobiliojoje dalyje pirkinio forma iš viso reikalinga.
Sprendimo skuba nedidelė — tai 2 etapo klausimas, ne 1.
