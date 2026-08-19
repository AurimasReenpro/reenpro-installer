# RLS peržiūra prieš roles

Data: 2026-08-14. Skaityta per Supabase MCP (read-only) iš gyvo projekto
`zfntcsdijgclolanwlpp`, ne iš migracijų failų. **Nieko nepakeista** — čia tik
radiniai ir siūlomas taisymas.

## Trumpai

Politikų yra **128**, ne 54 (AGENTS.md skaičius pasenęs). Visos iki vienos —
`PERMISSIVE`, `RESTRICTIVE` nėra nė vienos.

Tai svarbiausias dalykas, kurį reikia žinoti: **permissive politikos jungiamos
per OR**. Jei lentelė turi ir teisingą `is_admin()` politiką, ir seną `USING
(true)`, galioja `true`. Griežtesnė politika nieko nedaro.

Bazėje matyti **trys politikų kartos**, sudėtos viena ant kitos:

1. lietuviškais vardais („Leisti redagavimą“, „Visi mato komandas“),
2. `p1_*` (`p1_profiles_update`, `p1_company_write`),
3. trumpais priešdėliais (`up_*`, `cs_*`, `sem_*`, `sci_*`, `ph_*`, `teams_*`).

Kiekviena karta griežtino taisykles, bet **senosios niekada nebuvo pašalintos**.
Todėl visur galioja pati laisviausia.

## Kas veikia gerai

- `is_admin()` — `SECURITY DEFINER`, `search_path` prisegtas prie `public`,
  skaito `user_profiles.role = 'admin'`. Tvarkinga.
- Tas pats galioja `can_access_site()`, `is_assigned_to_site()`,
  `current_team_id()`, `my_team_id()`, `can_view_site_audit()`.
- **Visos `payroll_*` lentelės, `earnings_entries` ir `site_compensation`
  turi po vieną politiką: `ALL … USING is_admin()`.** Senų laisvų dublikatų
  čia nėra. Algų lentelės apsaugotos.
  (Nuo 2026-08-14 algų sąsaja dar ir atjungta — žr. AGENTS.md. Lentelės ir
  politikos bazėje nepaliestos, tad šis skyrius galioja toliau.)
- Rolės pakėlimą blokuoja **trys** `BEFORE UPDATE` trigeriai
  (`guard_user_profile_columns`, `prevent_profile_priv_escalation`,
  `user_profiles_guard`). Visi teisingi, tik vienas kito dublikatai —
  ta pati trijų kartų istorija. Montuotojas savęs adminu paversti negali.

## Radiniai

### 0. Nuotraukos pasiekiamos NEPRISIJUNGUS (rasta 2026-08-16)

Svarbiausias radinys. Rastas ne peržiūros metu, o tikrinant, ar pritaikyta 1
etapo migracija — pirmoji peržiūra jo praleido, nes žiūrėjo tik `public`
schemą.

`storage.objects` kartoja tą pačią trijų kartų istoriją, tik kaina didesnė:

```
Public Access                            ALL    TO public         USING (bucket_id = 'site-photos')
Leisti prisijungusiems matyti nuotraukas SELECT TO authenticated  USING (bucket_id = 'site-photos')
```

`public` rolė apima **`anon`**, t. y. neprisijungusį naudotoją, o `FOR ALL` be
atskiro `WITH CHECK` taiko `USING` ir įterpimui. Praktiškai bet kas iš
interneto galėjo skaityti, įkelti, perrašyti ir **ištrinti** montavimo
nuotraukas. Antroji politika leidžia bet kuriam prisijungusiam matyti visų
objektų nuotraukas.

Šalia yra keturios visiškai teisingos `p1_sitephotos_*` politikos su
`is_admin() OR is_assigned_to_site(foldername(name)[1])`. Jos nedarė nieko —
permissive politikos jungiamos per OR.

Prisideda tai, kad **visi trys segtuvai buvo `public: true`**. Tokiu atveju
objektai atiduodami viešu adresu apskritai neklausiant RLS, tad programos
`createSignedUrl` pastangos privatumui buvo beprasmės.

Uždaro `supabase/migrations/20260816120000_lock_storage_site_photos.sql`.
**`site_files` sąmoningai paliktas** — ten ta pati yda (`ALL TO authenticated`,
tikrinamas tik `bucket_id`), bet `src/api/sites.ts:314,340` skaito failus per
`getPublicUrl`, tad segtuvo uždarymas be kodo pataisos sulaužytų Brėžinius ir
Failus.

### 1. `company_settings.iban` rašomas bet kuriam prisijungusiam

Politika **„Admins can update settings“** yra `UPDATE USING (true) WITH CHECK
(true)`. Vardas sako viena, sąlyga kita. Šalia yra trys teisingos `ALL …
is_admin()` politikos, bet jos nieko negelbsti — OR.

Lentelėje: `iban`, `vat_code`, `company_code`, `company_name`, `address`,
`logo_url`. Sąskaitų rekvizitai. Tai rimčiausias radinys.

### 2. `user_profiles`: bet kas gali redaguoti bet kieno profilį

Politika **„Leisti redagavimą“** — `UPDATE USING (true)`, `WITH CHECK` nėra.
Kai `WITH CHECK` praleistas, Postgres naudoja `USING` — taigi `true`/`true`.

Trigeriai saugo `role`, `hourly_rate`, `team_id`, `work_role`,
`employment_status`, `deactivated_*`. **Nesaugo** `full_name`, `phone`,
`email`, `avatar_url` — šiuos bet kas gali perrašyti bet kam.

> **Pataisyta 2026-08-14 (antra sesija).** Pirmoji šio dokumento redakcija
> teigė, kad `rls_smoke_test.sql` testas **2d** turėtų kristi. Patikrinta —
> **jis nekrenta ir nepraeina, jis praleidžiamas.**
>
> `user_profiles` turi 2 eilutes: vieną adminą ir vieną montuotoją. Testo
> fixture'as `v_other_inst` ieško ANTRO ne-admino, jo neranda, ir 2d nueina
> į `RAISE NOTICE '[SKIP] 2d: no second non-admin user.'`
>
> Pati skylė reali — politika `USING (true)` niekur nedingo. Bet smoke testas
> jos neįrodo ir neįrodys, kol bazėje nebus antro ne-admin naudotojo. Todėl
> pridėtas `supabase/tests/rls_policy_invariants.sql`, kuriam fixture'ų
> nereikia: jis tikrina politikų rinkinį, ne elgseną.
>
> Iš to seka bendresnė pamoka: **`[SKIP]` smoke teste nėra gera žinia.** Šioje
> bazėje praleidžiamos būtent tos patikros, kurios liečia du skirtingus
> naudotojus — t. y. įdomiausios.

### 3. Algos matomos ir be `payroll_*` lentelių

`hourly_rate` yra `user_profiles` stulpelis, o `user_profiles` `SELECT` yra
atviras („Visi mato profilius“ + „Leisti skaityti profilius“, abu `true`).
Smoke teste tai pažymėta kaip **sąmoningas** sprendimas (vardų sąrašams).

Tačiau AGENTS.md 3 punkte rūpestis suformuluotas taip: „tiekimas matytų algas“.
Tas rūpestis pagrįstas, tik ne per `payroll_*` lenteles — **per
`user_profiles.hourly_rate`**. Naują rolę įvedus, valandinis įkainis jai bus
matomas iš karto, nieko papildomai nedarant.

### 4. Kitos laisvos politikos, uždengiančios griežtesnes

| Lentelė | Laisva politika | Ką leidžia bet kuriam prisijungusiam |
|---|---|---|
| `teams` | „Leisti komandų valdymą“ (`ALL true`) | kurti, pervadinti, trinti komandas |
| `site_extra_materials` | „authenticated read/insert/update extra materials“ | skaityti ir keisti visų objektų papildomas išlaidas |
| `site_file_annotations` | visos 4 (`true`) | skaityti, keisti, trinti bet kurio objekto brėžinių žymėjimus |
| `equipment_categories` | visos 4 (`true`) | trinti ir keisti įrangos kategorijas |
| `site_checklist_items` | „authenticated insert checklist items“ | įterpti punktus į bet kurio objekto sąrašą (tikrina tik ar tėvinis įrašas egzistuoja) |

`teams` ir `site_extra_materials` turi teisingus atitikmenis (`teams_admin`,
`sem_*`) — juos uždengia senoji karta. `site_file_annotations` ir
`equipment_categories` griežtos versijos apskritai neturi, ją reikia parašyti.

## Ką tai reiškia rolėms (AGENTS.md 3 punktas)

Prieš įvedant `tiekimas` rolę, verta žinoti dar vieną dalyką.

**Objektų matomumas remiasi komanda, ne role.** `can_access_site()` tikrina
`s.team_id = current_team_id()`. Nauja rolė su `team_id = NULL` nematys **nė
vieno objekto**; davus komandą, ji matys tiksliai tiek, kiek montuotojas.
Vidurio varianto nėra.

Taigi rolėms neužtenka naujos `user_profiles.role` reikšmės — reikia atskiro
predikato (pvz., `can_see_all_sites()`), kurį naudotų `can_access_site()`.
Kitaip nauja rolė bus arba akla, arba montuotojas.

## Valymo planas etapais

Tvarka svarbi: **pirma išvalyti senas politikas, tik paskui dėti roles.**
Kol galioja OR su `true`, bet kokia nauja rolės logika bus dekoracija.

Viena didelė migracija čia netinka. Etapai skiriasi ne dydžiu, o tuo, **kaip
įrodomas saugumas**: vieni nekeičia elgsenos iš principo, kiti ją keičia
sąmoningai ir reikalauja žmogaus patikros sąsajoje. Sudėjus į krūvą,
nebežinotum, kuris žingsnis ką sulaužė.

Matuoklis visiems etapams — `supabase/tests/rls_policy_invariants.sql`.
Etalonas prieš valymą: **1 anoniminio rašymo, 3 storage be tapatybės patikros,
11 atviro rašymo, 21 dublikatų grupė, 0 lentelių be politikų.**

> Tas failas iš pradžių tikrino tik `public` schemą ir dėl to **nematė
> svarbiausios skylės**. Nuo 2026-08-16 jis apima ir `storage`. Pamoka
> bendresnė: matuoklis, kurio apimtis siauresnė už problemos apimtį, ramina
> be pagrindo.

### 0 ir 1 etapai — ATLIKTA 2026-08-16

Abi migracijos pritaikytos ir patikrintos. Skaičiai po jų:

| Patikra | Prieš | Po |
|---|---|---|
| anoniminis rašymas | 1 | **0** |
| storage be tapatybės patikros | 3 | **1** |
| atviras rašymas | 11 | **10** |
| dublikatai | 21 | 21 |
| RLS be politikų | 0 | 0 |

Nenušluota per daug: `site-photos` liko 7 politikos (iš 9), visos tikrina
naudotoją; `company_settings` liko 3 admino rašymo politikos; `public`
schemoje 128 → 127; nė viena nuotrauka neprarasta.

**Tiesioginis įrodymas, kad skylė uždaryta** (2026-08-16, HTTP kreipiniai į
Supabase domeną, ne į programą):

| Adresas | Segtuvas | Atsakymas |
|---|---|---|
| `…/object/public/site-photos/…jpg` | privatus | **400**, neatiduoda |
| `…/object/public/branding/logo-…png` | viešas | **200, image/png** |

Kontrolinis bandymas su `branding` reikalingas tam, kad 400 nebūtų
paaiškinamas blogu adresu ar tinklu: tas pats domenas ir endpoint'as,
skiriasi tik segtuvo privatumas.

> Tikrinant per naršyklę nesupainioti domenų. Programos adresas yra už
> Cloudflare Access, tad bet koks kelias jame paprašys Microsoft
> prisijungimo — tai Access, o ne storage, ir apie RLS nesako nieko.
> Kreiptis reikia į `https://<project-ref>.supabase.co/storage/v1/…`.

Papildomai patikrinta, ar montuotojas nepraranda prieigos. Segtuve 13
objektų, visi su taisyklingu UUID aplanku, bet tik **6 atitinka egzistuojantį
objektą**; likusios 7 yra našlaitės. Visos 6 pasiekiamos priklauso objektams,
kurių komanda sutampa su montuotojo komanda, tad montuotojas mato tiek pat,
kiek matė. Našlaitės nuo šiol prieinamos tik adminui — anksčiau jas matė
visas internetas.

### Įrodymų ir ofiso medžiagos taisyklės (paruošta 2026-08-16)

Produktinis sprendimas: **montuotojas ofiso medžiagos netrina — tik žymi**, ir
neturi trinti kito montuotojo įrodymų. Dvi migracijos:

**`20260816140000_photo_delete_and_annotation_rules.sql`** — nulinės rizikos,
kodo nekeičia:

- `photos.ph_delete` (`can_access_site`) ir `storage.p1_sitephotos_delete`
  (bet kas priskirtas) pašalinamos. Lieka jau egzistavusi teisinga taisyklė:
  **adminas arba įkėlėjas**. Naujų kurti nereikėjo — jos buvo tik uždengtos.
- `site_file_annotations` pagaliau gauna RLS: skaito tie, kas mato objektą;
  rašo adminas ir prie objekto dirbantys; trina tik adminas.

**`20260816150000_lock_site_files_office_material.sql`** — čia guli tikroji
ofiso medžiaga.

Patikrinta, kad į `site-photos` biuras **nekelia nieko** (administracinėje
pusėje tokio kodo nėra, visos eilutės priklauso montuotojui). Brėžiniai ir
dokumentai yra `site_files`, o ten galiojo `ALL TO authenticated USING
(bucket_id = 'site_files')` — bet kas galėjo viską ištrinti.

Vien atimti montuotojui rašymą neužtenka: į tą patį segtuvą keliami žymėjimų
prisegtukai (`api/sites.ts:309`), o `removeAttachmentUrl` juos ir trina.
Todėl skiriama pagal kelio schemą:

| Antras kelio segmentas | Kas valdo |
|---|---|
| `ann_*` | adminas ir prie objekto dirbantys |
| bet kas kita | **tik adminas** |

Skaitymas nekeičiamas — brėžiniai montuotojui reikalingi darbui.

### 0 etapas — `storage`, `site-photos` (atlikta)

`supabase/migrations/20260816120000_lock_storage_site_photos.sql`. Šalinamos
dvi politikos, segtuvas paverčiamas privačiu.

Iškelta prieš `company_settings`, nes čia vienintelė vieta, kur duomenis gali
keisti **neprisijungęs** žmogus, ir vienintelė, kur galima negrįžtamai
sunaikinti darbo įrodymus.

Prieš rašant patikrinta, kad tai nieko nelaužia: `site-photos` niekur
neskaitomas per `getPublicUrl`, o senų įrašų su pilnu `https://` adresu nėra
(`photos.storage_path` 0 iš 5, `site_checklist_items.photo_url` 0 iš 4).

Laukiama: anoniminio rašymo 1 → **0**, storage be tapatybės 3 → **1**.

### 1 etapas — `company_settings` (paruošta)

`supabase/migrations/20260814170000_lock_company_settings_writes.sql`.
Pašalinama viena politika. Naujų nereikia — trys `ALL … is_admin()` jau
dengia ir INSERT, ir UPDATE.

Rizika mažiausia iš visų, o nauda didžiausia: tai vienintelė vieta, kur ant
kortos pinigai. Elgsena keičiasi tik ne-adminams, o jie Nustatymų puslapio ir
taip nepasiekia. Migracija turi savikontrolę: jei liktų atvira politika arba,
priešingai, nebeliktų nė vienos admino rašymo politikos, ji nutrūksta ir
atsisuka.

Laukiama: atviro rašymo 11 → **10**, dublikatų 21 → 21.

### 2–5 etapai — PRITAIKYTA 2026-08-19

Dvi migracijos. Priežastis daryti dabar: **montuotojai gaus atskiras Supabase
paskyras.** Kol jų buvo vienas, atviro rašymo politikos buvo teorija; atsiradus
keliems, jos tampa atsitiktinumo klausimu.

**Svarbu neperdėti.** Prieš rašant patikrinta, ar iš montuotojo paskyros galima
prasiplėsti iki svetimų objektų — **negalima**:
`guard_user_profile_columns` neleidžia keisti savo `team_id`, o `sites`
politikų `with_check` neleidžia persikelti objekto į kitą komandą. Tai tvarkos,
ne skylės taisymas.

`20260818160000_rls_stage2_drop_duplicate_policies.sql` — 23 perteklinės
politikos iš 21 grupės. Elgsena nesikeičia iš principo.

`20260818170000_rls_close_open_writes.sql` — 7 atviro rašymo politikos:

| Lentelė | Ką leido bet kuriam prisijungusiam | Kas lieka |
|---|---|---|
| `teams` | ištrinti komandą | `teams_admin`, `teams_select` |
| `user_profiles` | redaguoti kolegos vardą, telefoną | `up_update_self`, `p1_profiles_update` |
| `equipment_categories` | trinti ir keisti kategorijas | naujas `eq_cat_write` (is_admin) |
| `site_extra_materials` | skaityti ir keisti visų objektų | `sem_select`, `sem_insert`, `sem_admin_all` |

Būklė po jų turi būti: **0 atviro rašymo, 0 dublikatų grupių, 1 storage be
tapatybės, 0 anoniminio rašymo.**

**`site_extra_materials` rizika išspręsta patikrinimu, ne spėjimu.** Planas ją
vadino rizikingiausia vieta, nes eilutės kuriamos neprisijungus ir siunčiamos
vėliau. Patikrinta kode: daromas tik `insert` ir `delete`, **`update` nėra
niekur** (`offlineMutations.ts`, `useExtraWorks.ts`). Todėl atviros UPDATE
politikos atėmimas nieko nelaužo.

Papildomai pridėtas `sem_insert_assigned` (`is_assigned_to_site`), kad
įterpimas taptų simetriškas trynimui — anksčiau vardiniu būdu priskirtas
montuotojas eilutę galėjo ištrinti, bet ne sukurti. `site_assignments` turi
0 eilučių, tad šiandien tai niekam nekeičia elgsenos.

**Ko šios migracijos NELIEČIA ir kodėl:**

- `equipment_catalog.catalog_write_admin` atrodo kaip `ec_admin` dublikatas,
  bet nėra: jis rašo `EXISTS (SELECT … user_profiles …)` tiesiai, o
  `is_admin()` yra `SECURITY DEFINER`. Šiandien duoda tą patį; sugriežtinus
  `user_profiles` skaitymą — nebeduotų.
- `user_profiles` atviras `SELECT` lieka. Tai sąmoningas sprendimas vardų
  sąrašams, bet kartu reiškia, kad **`hourly_rate` matomas visiems
  prisijungusiems** (radinys nr. 3). Prieš įvedant tiekimo rolę tai reikės
  spręsti — tada ir keisis elgsena, tad reikės sąsajos patikros.

### 2 etapas — tikslūs dublikatai

21 grupė, apie 24 perteklinės politikos iš 128. Ta pati lentelė, komanda,
rolės ir **pažodžiui ta pati sąlyga**, tik kitas vardas.

Čia elgsena nesikeičia ne „turbūt“, o **iš principo**: permissive politikos
jungiamos per OR, o `X OR X = X`. Todėl šitą etapą galima daryti be jokios
sąsajos patikros — užtenka, kad invariantų testas parodytų 21 → 0, o
`rls_smoke_test.sql` liktų toks pat.

Siūlau daryti **antrą, prieš visus turinio pakeitimus**. Po jo politikų lieka
apie 104 ir rinkinys tampa perskaitomas; tolesni etapai nustoja būti
spėliojimu.

### 3 etapas — `user_profiles` „Leisti redagavimą“

Viena politika, `UPDATE USING (true)`. Trigeriai saugo `role`, `hourly_rate`,
`team_id`; nesaugo `full_name`, `phone`, `email`, `avatar_url`.

**Prieš tai reikia antro ne-admin naudotojo**, kitaip 2d ir toliau bus
praleidžiamas ir taisymo niekas nepatvirtins. Tai vienintelis etapas, kuriam
reikia paruošti duomenis, o ne kodą.

### 4 etapas — `teams`, `site_extra_materials`, `site_checklist_items`

Laisvos politikos, kurios TURI griežtus atitikmenis (`teams_admin`, `sem_*`,
`sci_insert`). Šalinamos laisvosios, naujų rašyti nereikia.

**Rizikingiausia vieta visame plane — `site_extra_materials`.**
`src/lib/offlineMutations.ts` rodo, kad montuotojas šias eilutes kuria ir
trina **neprisijungęs**, o jos išsiunčiamos vėliau. Jei griežtoji politika jo
nepraleistų, klaida išlįstų ne iš karto, o po sinchronizacijos — blogiausias
įmanomas laikas.

Konkretus skirtumas: `sem_insert` naudoja `can_access_site()` (adminas arba
**objekto komanda**), o `is_assigned_to_site()` papildomai praleidžia ir tuos,
kas priskirti tiesiogiai per `site_assignments`. Montuotojas, priskirtas
vardiniu būdu prie kitos komandos objekto, pirmąjį testą praeitų, antrojo ne.

Patikrinta: `site_assignments` šiandien turi **0 eilučių**, tad visa prieiga
eina per komandą ir abi funkcijos duoda tą patį. **Rizika latentinė, ne
dabartinė** — bet ji suveiktų tą dieną, kai kas nors priskirtų montuotoją
vardiniu būdu. Prieš šį etapą verta apsispręsti, ar `sem_*` politikos turi
naudoti `is_assigned_to_site()` vietoj `can_access_site()`.

### 5 etapas — `site_file_annotations`, `equipment_categories`

Vienintelis etapas, kur griežtų politikų **apskritai nėra** ir jas reikia
parašyti. Todėl elgsena tikrai keisis, ir tik čia būtina žmogaus patikra
sąsajoje.

Prieš rašant reikia atsakyti, kas jais naudojasi: `site_file_annotations`
skaito ir rašo `src/api/annotations.ts` per `ImageAnnotator`, o brėžinių
skirtukas yra ir administracinėje, ir mobiliojoje dalyje. Jei žymėjimus deda
montuotojas, tinka `can_access_site`; jei tik biuras — `is_admin()`.
`equipment_categories` redaguojamos iš `EquipmentCatalog`, t. y. iš
administracinės dalies, tad joms `is_admin()` atrodo teisingai.

### Ką daryti su trigerių dublikatais

`prevent_profile_priv_escalation` ir `user_profiles_guard` yra
`guard_user_profile_columns` poaibiai. Nekenkia, tik kartojasi. Siūlau liesti
paskutinius — jie yra vienintelė veikianti apsauga nuo rolės pakėlimo, o
nauda iš jų sutvarkymo vien kosmetinė.

---

### Ankstesnis vieno gabalo juodraštis

Paliktas kaip nuoroda, ką kuris etapas apima. **Netaikyti kaip vienos
migracijos** — dėl to ir surašyti etapai aukščiau.

```sql
-- 1. Politikos, kurios uždengia griežtesnes bendravardes
DROP POLICY IF EXISTS "Admins can update settings"            ON public.company_settings;
DROP POLICY IF EXISTS "Leisti redagavimą"                     ON public.user_profiles;
DROP POLICY IF EXISTS "Leisti komandų valdymą"                ON public.teams;
DROP POLICY IF EXISTS "authenticated read extra materials"    ON public.site_extra_materials;
DROP POLICY IF EXISTS "authenticated insert extra materials"  ON public.site_extra_materials;
DROP POLICY IF EXISTS "authenticated update extra materials"  ON public.site_extra_materials;
DROP POLICY IF EXISTS "authenticated insert checklist items"  ON public.site_checklist_items;

-- 2. Lentelės, kurios griežtos versijos apskritai neturi
--    (site_file_annotations turi site_id — tinka can_access_site)
DROP POLICY IF EXISTS "Leisti matyti žymėjimus"     ON public.site_file_annotations;
DROP POLICY IF EXISTS "Leisti įterpti žymėjimus"    ON public.site_file_annotations;
DROP POLICY IF EXISTS "Leisti atnaujinti žymėjimus" ON public.site_file_annotations;
DROP POLICY IF EXISTS "Leisti trinti žymėjimus"     ON public.site_file_annotations;

CREATE POLICY sfa_select ON public.site_file_annotations
  FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY sfa_insert ON public.site_file_annotations
  FOR INSERT TO authenticated WITH CHECK (public.can_access_site(site_id));
CREATE POLICY sfa_update ON public.site_file_annotations
  FOR UPDATE TO authenticated
  USING (public.can_access_site(site_id)) WITH CHECK (public.can_access_site(site_id));
CREATE POLICY sfa_delete ON public.site_file_annotations
  FOR DELETE TO authenticated USING (public.can_access_site(site_id));

-- equipment_categories: skaityti visiems, rašyti tik adminams
DROP POLICY IF EXISTS "Authenticated users can insert categories" ON public.equipment_categories;
DROP POLICY IF EXISTS "Authenticated users can update categories" ON public.equipment_categories;
DROP POLICY IF EXISTS "Authenticated users can delete categories" ON public.equipment_categories;

CREATE POLICY eq_cat_write ON public.equipment_categories
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
```

## Kaip tikriname kiekvieną etapą

Ta pati seka visiems etapams:

1. **Prieš.** Paleisti `supabase/tests/rls_policy_invariants.sql` ir užsirašyti
   skaičius. Jis skaito tik `pg_policies`, tad tinka ir per Supabase MCP.
2. **Prieš.** Paleisti `supabase/tests/rls_smoke_test.sql`. Jis apvyniotas
   `BEGIN … ROLLBACK`, tad nieko nepalieka. **Skaityti ne tik `[FAIL]`, bet ir
   `[SKIP]`** — šioje bazėje praleidžiamos patikros yra pagrindinė aklavietė.
3. Paleisti migraciją.
4. **Po.** Abu testus iš naujo ir palyginti su „prieš“. Invariantų skaičiai
   turi pasikeisti tiksliai tiek, kiek etape parašyta — ne daugiau.
5. **Po.** Sąsajos patikra, jei etapas keičia elgseną (4 ir 5 etapai; 1 ir 2 —
   nereikia, ten elgsena nesikeičia).

Kas dar netikrinama niekur: `storage.objects` politikos. Joms reikia tikrų
failų segtuve, tad jos tikrinamos tik per programą.
