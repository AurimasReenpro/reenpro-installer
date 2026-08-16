-- ============================================================
-- Migracija: kas gali trinti nuotraukas ir keisti žymėjimus
--
-- SPRENDIMAS (2026-08-16): montuotojas ofiso medžiagos netrina — tik žymi.
-- Ir montuotojas neturi trinti kito montuotojo įrodymų.
--
-- ── 1. NUOTRAUKŲ TRYNIMAS ────────────────────────────────────────────────
--
-- Teisinga taisyklė bazėje JAU parašyta, tik uždengta. Trynimą valdo penkios
-- politikos dviejose vietose, ir laisviausios nustelbia griežtąsias:
--
--   public.photos
--     ph_delete                                can_access_site(site_id)          ← per plati
--     p1_photos_delete                         adminas ARBA įkėlėjas + priskyrimas
--     "Trinti nuotraukas tik savo arba adminams"  adminas ARBA įkėlėjas
--     ph_admin_all (ALL)                       adminas
--
--   storage.objects
--     p1_sitephotos_delete                     adminas ARBA bet kas priskirtas ← per plati
--     "Trinti storage nuotraukas"              adminas ARBA įkėlėjas
--
-- `can_access_site` ir `is_assigned_to_site` reiškia „bet kas iš objekto
-- komandos“. Todėl šiandien montuotojas gali ištrinti kito montuotojo
-- nuotrauką, o jei biuras ką nors įkeltų — ir biuro.
--
-- Pašalinus dvi plačiąsias, lieka **adminas arba įkėlėjas**. Naujų kurti
-- nereikia.
--
-- Šalutinis teigiamas efektas: 8 saugyklos objektai neturi `photos` eilutės
-- (išmatuota), tad įkėlėjo nustatyti neįmanoma — juos nuo šiol ištrinti gali
-- tik adminas. Taip ir turi būti.
--
-- ── 2. ŽYMĖJIMAI ─────────────────────────────────────────────────────────
--
-- `site_file_annotations` iki šiol neturėjo jokios apsaugos: visos keturios
-- politikos `USING (true)`. Bet kuris prisijungęs galėjo perrašyti bet kurio
-- objekto žymėjimus, nesvarbu, ar to objekto apskritai mato.
--
-- Naujos taisyklės atitinka tai, ką nusprendėme sąsajoje: skaito visi, kas
-- mato objektą; rašo tie, kas prie jo dirba, ir adminas. Trynimas — tik
-- adminui: žymėjimas yra pastaba prie įrodymo, ne juodraštis.
--
-- Biurui rašymas BŪTINAS: administracinėje pusėje brėžiniai žymimi be
-- `readOnly` (`BlueprintsTab`), o nuotraukos — su juo.
--
-- ── KO ŠI MIGRACIJA NEDARO ───────────────────────────────────────────────
--
-- Neliečia `site_files`, o būtent ten guli tikroji ofiso medžiaga (brėžiniai,
-- dokumentai). Politika "Leisti pilną priėjimą prie failų" leidžia bet kuriam
-- prisijungusiam juos ir skaityti, ir trinti. Uždaryti dabar negalima:
-- `src/api/sites.ts:314,340` skaito failus per `getPublicUrl`, o žymėjimų
-- prisegtukai (`ann_*`) į tą patį segtuvą keliami montuotojo. Reikia pirma
-- perkelti prisegtukus į `site-photos` ir pereiti prie pasirašytų nuorodų.
-- Tai atskiras žingsnis su kodo pakeitimu ir preview.
-- ============================================================

-- ── 1. Nuotraukų trynimas ──────────────────────────────────────────────
DROP POLICY IF EXISTS ph_delete              ON public.photos;
DROP POLICY IF EXISTS p1_sitephotos_delete   ON storage.objects;

-- ── 2. Žymėjimai ───────────────────────────────────────────────────────
ALTER TABLE public.site_file_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leisti matyti žymėjimus"     ON public.site_file_annotations;
DROP POLICY IF EXISTS "Leisti įterpti žymėjimus"    ON public.site_file_annotations;
DROP POLICY IF EXISTS "Leisti atnaujinti žymėjimus" ON public.site_file_annotations;
DROP POLICY IF EXISTS "Leisti trinti žymėjimus"     ON public.site_file_annotations;

CREATE POLICY sfa_select ON public.site_file_annotations
  FOR SELECT TO authenticated
  USING (public.can_access_site(site_id));

CREATE POLICY sfa_insert ON public.site_file_annotations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_assigned_to_site(site_id));

CREATE POLICY sfa_update ON public.site_file_annotations
  FOR UPDATE TO authenticated
  USING      (public.is_admin() OR public.is_assigned_to_site(site_id))
  WITH CHECK (public.is_admin() OR public.is_assigned_to_site(site_id));

CREATE POLICY sfa_delete ON public.site_file_annotations
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- Savikontrolė
-- ────────────────────────────────────────────────────────────
DO $savikontrole$
DECLARE
  plataus_trynimo INT;
  atviru_zymejimu INT;
  savo_trynimas   INT;
BEGIN
  -- (a) Nebeturi likti trynimo taisyklės, kuri remiasi vien komandos naryste.
  SELECT count(*) INTO plataus_trynimo
  FROM pg_policies
  WHERE ((schemaname = 'public'  AND tablename = 'photos')
      OR (schemaname = 'storage' AND tablename = 'objects' AND qual LIKE '%site-photos%'))
    AND cmd = 'DELETE'
    AND COALESCE(qual, '') !~ 'installer_id|photos\.installer_id'
    AND COALESCE(qual, '') !~ '^\(?is_admin\(\)\)?$';

  IF plataus_trynimo > 0 THEN
    RAISE EXCEPTION 'liko % trynimo politiku, kurios neremiasi ikeleju', plataus_trynimo;
  END IF;

  -- (b) Įkėlėjo taisyklė turi IŠLIKTI, kitaip montuotojas nebegalėtų
  --     ištrinti net savo klaidingai įkeltos nuotraukos.
  SELECT count(*) INTO savo_trynimas
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'photos' AND cmd = 'DELETE'
    AND COALESCE(qual, '') LIKE '%installer_id%';

  IF savo_trynimas = 0 THEN
    RAISE EXCEPTION 'neliko nė vienos taisykles, leidziancios istrinti SAVO nuotrauka';
  END IF;

  -- (c) Žymėjimai nebeturi būti atviri.
  SELECT count(*) INTO atviru_zymejimu
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'site_file_annotations'
    AND (btrim(COALESCE(qual, ''), '() ') = 'true'
      OR btrim(COALESCE(with_check, ''), '() ') = 'true');

  IF atviru_zymejimu > 0 THEN
    RAISE EXCEPTION 'site_file_annotations liko % atviru politiku', atviru_zymejimu;
  END IF;

  RAISE NOTICE 'Trynimas: adminas arba ikelejas. Zymejimai: skaito matantys objekta, raso dirbantys.';
END
$savikontrole$;

SELECT pg_notify('pgrst', 'reload schema');

-- ════════════════════════════════════════════════════════════
-- PATIKRINIMAS
-- ────────────────────────────────────────────────────────────
-- (a) `supabase/tests/rls_policy_invariants.sql`: „atviras rasymas“ turi
--     sumažėti 10 → 7 (dingsta trys `site_file_annotations` eilutės).
--
-- (b) MONTUOTOJU mobiliojoje dalyje — svarbiausia patikra:
--       • savo įkeltą nuotrauką ištrinti VIS DAR gali;
--       • nuotrauką pažymėti gali, žymėjimas išsisaugo;
--       • brėžinius mato.
--
-- (c) ADMINU: nuotraukas trinti gali; brėžinių žymėjimus kurti ir keisti
--     gali; nuotraukų žymėjimus mato tik peržiūrai.
--
-- (d) Neigiama patikra reikalauja ANTRO montuotojo, kurio bazėje nėra.
--     Todėl „montuotojas negali ištrinti svetimos nuotraukos“ šiandien
--     patikrinamas tik iš politikų rinkinio, ne elgsena. Tas pats trūkumas,
--     dėl kurio `rls_smoke_test.sql` testas 2d praleidžiamas.
-- ════════════════════════════════════════════════════════════
