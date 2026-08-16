-- ============================================================
-- Migracija: uždaryti company_settings rašymą ne administratoriams
--
-- PRIEŽASTIS. Lentelė `public.company_settings` laiko įmonės rekvizitus:
-- `iban`, `vat_code`, `company_code`, `company_name`, `address`, `logo_url`.
-- Ant jos yra 7 politikos, ir visos PERMISSIVE. Tarp jų:
--
--   "Admins can update settings"  UPDATE  USING (true)  WITH CHECK (true)
--
-- Vardas sako viena, sąlyga kita. Kadangi permissive politikos jungiamos per
-- OR, ši viena eilutė nustelbia tris teisingas `ALL ... USING is_admin()`
-- politikas ("Tik adminai gali keisti įmonės nustatymus", `cs_admin`,
-- `p1_company_write`). Rezultatas: **bet kuris prisijungęs naudotojas galėjo
-- perrašyti banko sąskaitos numerį.**
--
-- Rasta 2026-08-14 per RLS peržiūrą, žr. `supabase/RLS-PERZIURA.md` (1 radinys).
--
-- TAISYMAS. Pašalinama tik ta viena politika. Naujų kurti nereikia — trys
-- `ALL` politikos jau dengia ir INSERT, ir UPDATE administratoriui.
--
-- KODĖL UŽTENKA CHIRURGINIO ŠALINIMO, o ne „nušluoti ir atkurti“ (kaip
-- 20260705120000_fix_sites_select_rls.sql): ten politikų vardai buvo
-- nežinomi, nes kūrėsi per dashboard. Čia visos 7 politikos suskaičiuotos iš
-- `pg_policies`, tad rinkinys žinomas pilnai ir spėlioti nereikia.
--
-- POVEIKIS SĄSAJAI. `src/api/settings.ts` naudoja `upsert`, tad reikia ir
-- INSERT (WITH CHECK), ir UPDATE (USING + WITH CHECK). Abi dengia `ALL
-- ... is_admin()`, todėl administratoriui Nustatymų puslapis veikia kaip
-- veikęs. Skaitymas nekeičiamas: trys `SELECT USING (true)` politikos lieka
-- (logotipas ir spalva reikalingi visiems, `useBranding`).
--
-- KAS PRARANDA TEISĘ: montuotojas ir bet kuri būsima ne-admin rolė. Sąsajoje
-- jie Nustatymų puslapio ir taip nepasiekia (`RoleRedirect`), tad matomo
-- pokyčio neturėtų būti — dingsta tik galimybė apeiti sąsają per API.
-- ============================================================

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can update settings" ON public.company_settings;

-- ────────────────────────────────────────────────────────────
-- Savikontrolė. Jei po šalinimo ant lentelės liktų bent viena rašyti
-- leidžianti politika, kurios sąlyga nėra `is_admin()`, migracija nutraukiama
-- ir viskas atsukama. Geriau kristi čia, negu tyliai palikti skylę.
-- ────────────────────────────────────────────────────────────
DO $savikontrole$
DECLARE
  liko TEXT;
  rasymo_politiku INT;
BEGIN
  -- Tikrinama tik tai, kas iš tikrųjų buvo klaida: rašyti leidžianti
  -- PERMISSIVE politika, kurios sąlyga yra tiesiog `true`. Sąlygos nėra
  -- (`NULL`) ten, kur jos ir neturi būti — INSERT neturi USING, o DELETE
  -- neturi WITH CHECK — todėl NULL nelaikomas pažeidimu.
  SELECT string_agg(format('%s (%s)', policyname, cmd), ', ')
  INTO liko
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'company_settings'
    AND permissive = 'PERMISSIVE'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND (btrim(COALESCE(qual, ''), '() ') = 'true'
      OR btrim(COALESCE(with_check, ''), '() ') = 'true');

  IF liko IS NOT NULL THEN
    RAISE EXCEPTION 'company_settings liko rasymo politiku su true salyga: %', liko;
  END IF;

  -- Antra pusė: administratorius turi IŠLIKTI galintis rašyti. Jei per klaidą
  -- butu nusluota per daug, Nustatymu puslapis nutiltu tik gyvai — geriau
  -- kristi cia.
  SELECT count(*) INTO rasymo_politiku
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'company_settings'
    AND cmd IN ('INSERT', 'UPDATE', 'ALL')
    AND COALESCE(with_check, '') LIKE '%is_admin()%';

  IF rasymo_politiku = 0 THEN
    RAISE EXCEPTION 'company_settings neliko nė vienos is_admin() rasymo politikos - adminas nebegaletu issaugoti nustatymu';
  END IF;

  RAISE NOTICE 'company_settings: rasyti gali tik is_admin() (% politikos). Skaitymas nekeistas.', rasymo_politiku;
END
$savikontrole$;

SELECT pg_notify('pgrst', 'reload schema');

-- ════════════════════════════════════════════════════════════
-- PATIKRINIMAS
-- ────────────────────────────────────────────────────────────
-- (a) Politikų inventorius — laukiama lygiai 6 eilučių: 3 × ALL su is_admin()
--     ir 3 × SELECT su true. Nė vienos UPDATE eilutės:
--
--   select policyname, cmd, qual, with_check from pg_policies
--   where schemaname='public' and tablename='company_settings' order by cmd, policyname;
--
-- (b) `supabase/tests/rls_policy_invariants.sql` — company_settings eilutė
--     turi pavirsti iš PAZEIDIMAS į GERAI. Šis testas neturi fixture'ų, tad
--     jį galima paleisti ir prieš, ir po, ir palyginti.
--
-- (c) Sąsaja, prisijungus ADMINU: Nustatymai → pakeisti įmonės pavadinimą →
--     Išsaugoti → perkrauti puslapį, reikšmė turi išlikti. Tai tikrina
--     `upsert` kelią (INSERT + UPDATE), kuris ir yra rizikingiausia vieta.
--
-- (d) Logotipas ir spalva turi likti matomi VISIEMS, taip pat montuotojui
--     mobiliojoje dalyje (`useBranding` skaito tą pačią lentelę). Jei
--     montuotojui dingtų logotipas — būtų nušluota per daug.
-- ════════════════════════════════════════════════════════════
