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

## Atviri klausimai

1. Ar sandėlys vienas, ar jų keli (automobiliai kaip atskiri sandėliai)?
   Nuo to priklauso, ar `stock_movements` reikia `location_id`.
2. Ar montuotojas gali suvesti medžiagą, kurios nėra kataloge? Jei taip,
   reikia „laukia patvirtinimo" būsenos katalogo įrašui, kitaip katalogas
   greitai taps šiukšlynu.
3. Ar rangos vadovas gali taisyti montuotojo suvestą faktą, ar tik priimti
   arba grąžinti? Antras variantas švaresnis — įrodymas lieka montuotojo.
