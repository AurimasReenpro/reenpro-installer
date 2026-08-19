-- RLS: atviro rašymo uždarymas (plano 3, 4 ir 5 etapai kartu).
--
-- KODĖL DABAR. Montuotojai gaus atskiras Supabase paskyras. Kol jų buvo vienas,
-- šios politikos buvo teorija; atsiradus keliems, jos tampa atsitiktinumo
-- klausimu — ne ataka, o netyčia ištrinta komanda ar kategorija.
--
-- KO ČIA NĖRA. Prasiplėsti iki svetimų objektų iš montuotojo paskyros nebuvo
-- galima ir prieš šią migraciją: `guard_user_profile_columns` neleidžia keisti
-- savo `team_id`, o `sites` politikų `with_check` neleidžia persikelti objekto
-- į kitą komandą. Tai tvarkos, ne skylės taisymas.
--
-- Prieš: 7 atviro rašymo politikos. Po: 0.
--
-- Idempotentiška: bazėje migracijų registro nėra.

begin;

-- ── teams ───────────────────────────────────────────────────────────────────
-- „Leisti komandų valdymą" yra ALL USING (true) — bet kuris prisijungęs galėjo
-- ištrinti komandą. Komanda yra tai, pagal ką `can_access_site()` sprendžia
-- matomumą, tad jos praradimas atimtų prieigą visiems joje esantiems.
-- Lieka `teams_admin` (ALL is_admin) ir `teams_select` (SELECT true).
drop policy if exists "Leisti komandų valdymą" on public.teams;

-- ── user_profiles ───────────────────────────────────────────────────────────
-- „Leisti redagavimą" yra UPDATE USING (true) be WITH CHECK, tad Postgres
-- naudoja USING ir įrašymui. Trigeriai saugo `role`, `team_id`, `hourly_rate`,
-- `work_role`, bet NESAUGO `full_name`, `phone`, `email`, `avatar_url` —
-- juos bet kas galėjo perrašyti bet kam.
-- Lieka `up_update_self` (savo profilis) ir `p1_profiles_update`
-- (is_admin() OR savo) — tiek, kiek programai reikia.
drop policy if exists "Leisti redagavimą" on public.user_profiles;

-- ── equipment_categories ────────────────────────────────────────────────────
-- Vienintelė vieta šioje migracijoje, kur griežtos politikos APSKRITAI nebuvo —
-- ją reikia parašyti. Kategorijos redaguojamos tik iš „Katalogas" ekrano
-- administracinėje pusėje, tad `is_admin()` atitinka tikrą naudojimą.
-- Skaitymas nekeičiamas: kategorijų vardų reikia ir montuotojo ekranui.
drop policy if exists "Authenticated users can insert categories" on public.equipment_categories;
drop policy if exists "Authenticated users can update categories" on public.equipment_categories;
drop policy if exists "Authenticated users can delete categories" on public.equipment_categories;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='equipment_categories' and policyname='eq_cat_write'
  ) then
    create policy eq_cat_write on public.equipment_categories
      for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- ── site_extra_materials ────────────────────────────────────────────────────
-- Plano rizikingiausia vieta: šias eilutes montuotojas kuria ir trina
-- NEPRISIJUNGĘS (`src/lib/offlineMutations.ts`), o jos išsiunčiamos vėliau.
-- Griežtesnė politika, kuri jo nepraleistų, lūžtų ne iš karto, o po
-- sinchronizacijos — blogiausiu įmanomu metu.
--
-- Todėl patikrinta kode: daromas TIK `insert` ir `delete`, `update` nėra
-- niekur. Atviros UPDATE politikos atėmimas nieko nelaužo; adminui atnaujinimą
-- palieka `sem_admin_all`.
drop policy if exists "authenticated read extra materials"   on public.site_extra_materials;
drop policy if exists "authenticated insert extra materials" on public.site_extra_materials;
drop policy if exists "authenticated update extra materials" on public.site_extra_materials;

-- Įterpimui lieka `sem_insert` su `can_access_site()` (adminas arba objekto
-- komanda). DELETE jau turi DVI politikas — `sem_delete` (can_access_site) ir
-- „team delete extra materials" (is_assigned_to_site). Įterpimą padarome
-- simetrišką, kad dingtų latentinis spąstas: montuotojas, priskirtas vardiniu
-- būdu prie kitos komandos objekto, galėtų eilutę ištrinti, bet ne sukurti.
-- Šiandien `site_assignments` turi 0 eilučių, tad elgsena nesikeičia niekam.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='site_extra_materials' and policyname='sem_insert_assigned'
  ) then
    create policy sem_insert_assigned on public.site_extra_materials
      for insert to authenticated
      with check (public.is_assigned_to_site(site_id));
  end if;
end $$;

-- ── Savikontrolė ────────────────────────────────────────────────────────────
do $$
declare
  atviru integer;
  liko    text;
begin
  select count(*) into atviru
  from pg_policies
  where schemaname in ('public','storage')
    and cmd <> 'SELECT'
    and roles::text like '%authenticated%'
    and (coalesce(qual,'') = 'true' or coalesce(with_check,'') = 'true');

  if atviru <> 0 then
    select string_agg(format('%s.%s', tablename, policyname), ', ') into liko
    from pg_policies
    where schemaname in ('public','storage')
      and cmd <> 'SELECT'
      and roles::text like '%authenticated%'
      and (coalesce(qual,'') = 'true' or coalesce(with_check,'') = 'true');
    raise exception 'Liko atviro rašymo politikų (%): %', atviru, liko;
  end if;

  -- Neatimta per daug: kiekviena paliesta lentelė turi likusį rašymo kelią.
  if not exists (select 1 from pg_policies where tablename='teams' and cmd in ('ALL','UPDATE')) then
    raise exception 'teams liko be rašymo politikos';
  end if;
  if not exists (select 1 from pg_policies where tablename='user_profiles' and cmd in ('ALL','UPDATE')) then
    raise exception 'user_profiles liko be atnaujinimo politikos';
  end if;
  if not exists (select 1 from pg_policies where tablename='equipment_categories' and policyname='eq_cat_write') then
    raise exception 'equipment_categories liko be rašymo politikos';
  end if;
  if not exists (select 1 from pg_policies where tablename='site_extra_materials' and cmd='INSERT') then
    raise exception 'site_extra_materials liko be įterpimo politikos';
  end if;
end $$;

commit;
