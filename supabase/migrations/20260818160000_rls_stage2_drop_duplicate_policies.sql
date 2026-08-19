-- RLS 2 etapas: tikslūs politikų dublikatai.
--
-- 21 grupė, 23 perteklinės politikos. Kiekvienoje grupėje ta pati lentelė, ta
-- pati komanda, tos pačios rolės ir PAŽODŽIUI ta pati sąlyga — skiriasi tik
-- vardas. Trys politikų kartos (lietuviški vardai, `p1_*`, trumpi priešdėliai)
-- buvo sudėtos viena ant kitos, o senosios niekada nešalintos.
--
-- ELGSENA NESIKEIČIA IŠ PRINCIPO, ne „turbūt": permissive politikos jungiamos
-- per OR, o `X OR X = X`. Todėl šio etapo nereikia tikrinti sąsajoje —
-- užtenka, kad invariantų testas parodytų 21 → 0.
--
-- Paliekamas naujausios kartos vardas, IŠSKYRUS `site_checklists`, kur abu
-- vardai lietuviški: ten paliekamas tas, kuris sąlygą aprašo teisingai
-- („Authenticated gali matyti site_checklists" meluoja — politika tikrina
-- is_admin() OR is_assigned_to_site()).
--
-- KO ČIA NĖRA. `equipment_catalog.catalog_write_admin` atrodo kaip `ec_admin`
-- dublikatas, bet nėra: jis įrašo `EXISTS (SELECT … user_profiles …)` tiesiai,
-- o `is_admin()` yra SECURITY DEFINER. Šiandien jie duoda tą patį, tačiau
-- sugriežtinus `user_profiles` skaitymą — nebeduotų. Paliekamas sąmoningai,
-- nes šio etapo garantija yra nulinė rizika.
--
-- Idempotentiška: `drop policy if exists`, o bazėje migracijų registro nėra.

begin;

-- company_settings (2 grupės po 3)
drop policy if exists "Visi authenticated gali matyti įmonės nustatymus" on public.company_settings;
drop policy if exists "p1_company_select"                                on public.company_settings;
drop policy if exists "Tik adminai gali keisti įmonės nustatymus"        on public.company_settings;
drop policy if exists "p1_company_write"                                 on public.company_settings;

-- checklist_categories
drop policy if exists "Valdyti kategorijas tik adminams"      on public.checklist_categories;
drop policy if exists "Leisti visiems matyti kategorijas"     on public.checklist_categories;

-- checklist_templates
drop policy if exists "Leisti visiems matyti šablonus"        on public.checklist_templates;
drop policy if exists "Valdyti šablonus tik adminams"         on public.checklist_templates;

-- equipment_catalog
drop policy if exists "catalog_read_all"                      on public.equipment_catalog;

-- photos
drop policy if exists "Matyti nuotraukas adminams ir priskirtiems montuotojams" on public.photos;

-- site_assignments
drop policy if exists "Leisti valdyti priskyrimus tik adminams"          on public.site_assignments;
drop policy if exists "Leisti matyti priskyrimus adminams arba sau"      on public.site_assignments;

-- site_checklists (4 grupės)
drop policy if exists "Leisti trinti checklists tik adminams_del"        on public.site_checklists;
drop policy if exists "Leisti kurti ir trinti checklists tik adminams"   on public.site_checklists;
drop policy if exists "Authenticated gali matyti site_checklists"        on public.site_checklists;
drop policy if exists "Authenticated gali atnaujinti site_checklists"    on public.site_checklists;

-- site_revisits
drop policy if exists "Admins insert site revisits"           on public.site_revisits;

-- teams
drop policy if exists "Valdyti komandas tik adminams"         on public.teams;
drop policy if exists "Visi mato komandas"                    on public.teams;

-- time_entries
drop policy if exists "Leisti trinti laiko įrašus tik adminams"      on public.time_entries;
drop policy if exists "Leisti matyti laiką adminams arba savininkams" on public.time_entries;

-- user_profiles
drop policy if exists "Leisti skaityti profilius"             on public.user_profiles;
drop policy if exists "Redaguoti tik savo profilį"            on public.user_profiles;

-- ── Savikontrolė ────────────────────────────────────────────────────────────
-- Migracija, kuri tyliai nušluoja per daug, blogesnė už nepaleistą. Tikrinama,
-- kad kiekviena paliesta lentelė TURI likusią politiką kiekvienai komandai,
-- kuri buvo prieš tai.
do $$
declare
  trukumas text;
begin
  select string_agg(format('%s.%s', t.tbl, t.cmd), ', ')
    into trukumas
  from (values
    ('company_settings','SELECT'), ('company_settings','ALL'),
    ('checklist_categories','SELECT'), ('checklist_categories','ALL'),
    ('checklist_templates','SELECT'), ('checklist_templates','ALL'),
    ('equipment_catalog','SELECT'),
    ('photos','SELECT'),
    ('site_assignments','SELECT'), ('site_assignments','ALL'),
    ('site_checklists','SELECT'), ('site_checklists','INSERT'),
    ('site_checklists','UPDATE'), ('site_checklists','DELETE'),
    ('site_revisits','INSERT'),
    ('teams','SELECT'), ('teams','ALL'),
    ('time_entries','SELECT'), ('time_entries','DELETE'),
    ('user_profiles','SELECT'), ('user_profiles','UPDATE')
  ) as t(tbl, cmd)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.tbl
      and (p.cmd = t.cmd or p.cmd = 'ALL')
  );

  if trukumas is not null then
    raise exception 'Nušluota per daug — liko be politikos: %', trukumas;
  end if;
end $$;

commit;
