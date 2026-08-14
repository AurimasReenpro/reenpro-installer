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

> `supabase/tests/rls_smoke_test.sql` testas **2d** tikisi, kad svetimo profilio
> `UPDATE` palies 0 eilučių („RLS USING id = auth.uid()“). Su dabartiniu
> politikų rinkiniu jis palies 1 eilutę, ir testas turėtų kristi. Jei jis
> praeina — vadinasi, smoke testas nebuvo leistas prieš šią bazę.

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

## Siūlomas taisymas

Tvarka svarbi: **pirma išvalyti senas politikas, tik paskui dėti roles.**
Kol galioja OR su `true`, bet kokia nauja rolės logika bus dekoracija.

Migracijos juodraštis (į `supabase/migrations/`, **dar neparašytas ir
nepritaikytas** — laukia sprendimo):

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

Trigerių dublikatus (`prevent_profile_priv_escalation`, `user_profiles_guard`)
galima palikti — jie nekenkia, tik kartojasi. `guard_user_profile_columns` yra
pilniausias.

### Prieš taikant

1. Paleisti `supabase/tests/rls_smoke_test.sql` **dabar**, kad būtų užfiksuota
   „prieš“ būsena. Laukiama, kad **2d kris** — tai patvirtins 2 radinį.
2. Patikrinti, ar sąsaja niekur nesiremia laisvomis politikomis. Įtartinos
   vietos: įrangos kategorijų redagavimas (`EquipmentCatalog`), brėžinių
   žymėjimai (`BlueprintsTab`, `ImageAnnotator`), papildomos medžiagos
   (`ExtraMaterialsSection`) — jei jos veikia ne admino teisėmis, po taisymo
   nustos veikti. Tai būtų teisinga, bet apie tai reikia žinoti iš anksto.
3. Paleisti smoke testą dar kartą po migracijos.
