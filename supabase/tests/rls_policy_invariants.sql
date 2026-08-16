-- ============================================================================
-- RLS INVARIANTAI — struktūrinė patikra be fixture'ų
-- ============================================================================
-- KAM ŠITO REIKIA, kai jau yra `rls_smoke_test.sql`.
--
-- Smoke testas apsimeta tikru administratoriumi ir tikru montuotoju, tad
-- randa tai, ko iš struktūros nematyti. Bet jis turi silpnybę: jei bazėje
-- nėra tinkamų naudotojų, patikros ne krenta, o **praleidžiamos**.
--
-- 2026-08-14 tai ir paaiškėjo. `user_profiles` turi 2 eilutes — vieną adminą
-- ir vieną montuotoją. Testas 2d ieško ANTRO ne-admino (`v_other_inst`), jo
-- neranda, ir rašo `[SKIP] 2d: no second non-admin user.` Todėl radinys, kad
-- bet kas gali redaguoti bet kieno profilį, smoke testu NEĮRODOMAS.
-- Ankstesnė prognozė „2d kris“ buvo klaidinga — jis praleidžiamas.
--
-- Šis failas tikrina ne elgseną, o politikų RINKINĮ. Fixture'ų nereikia,
-- todėl rezultatas nepriklauso nuo naudotojų skaičiaus, ir jį galima paleisti
-- prieš migraciją ir po jos bei palyginti eilutė į eilutę.
--
-- KAIP PALEISTI:
--   • Supabase SQL Editor: įklijuoti ir paleisti.
--   • psql "$DATABASE_URL" -f supabase/tests/rls_policy_invariants.sql
--   • Arba per Supabase MCP — užklausa TIK SKAITO, tad read-only režimas jai
--     netrukdo. Būtent todėl ji parašyta viena SELECT užklausa, o ne DO
--     blokais su RAISE.
--
-- KAIP SKAITYTI:
--   `sunkumas = 1` — reali skylė, taisyti.
--   `sunkumas = 2` — perteklius: kelios politikos su VIENODA sąlyga. Ne
--                    skylė, bet būtent dėl to rinkinys nebeperskaitomas.
--                    Šalinti galima be elgsenos pokyčio (OR su savimi = tas
--                    pats), tad tai pigiausias valymo etapas.
--   `sunkumas = 3` — RLS įjungtas, bet politikų nėra: lentelė tyliai
--                    neprieinama niekam, išskyrus `service_role`.
--
-- KO ČIA SĄMONINGAI NĖRA: „laisva SELECT politika šalia griežtos ALL“
-- nežymima. Tai normalus raštas — atmintinės ir katalogai skaitomi visų, o
-- rašomi tik adminų. Pirmoji šio failo versija tokius žymėjo ir davė 36
-- eilutes triukšmo, iš kurių tikrų problemų buvo vos kelios.
-- ============================================================================

WITH
-- 1. Rašyti leidžianti PERMISSIVE politika, kurios sąlyga yra tiesiog `true`.
--    Tiksliai ta klaidų klasė, dėl kurios `company_settings.iban` buvo
--    perrašomas bet kam. NULL nelaikomas pažeidimu: INSERT neturi USING, o
--    DELETE neturi WITH CHECK — ten tuščia vieta yra normalu.
atviras_rasymas AS (
  SELECT
    1 AS sunkumas,
    'atviras rasymas' AS problema,
    tablename,
    cmd,
    policyname AS detale,
    'USING/WITH CHECK yra true - rasyti gali bet kuris prisijunges' AS paaiskinimas
  FROM pg_policies
  WHERE schemaname = 'public'
    AND permissive = 'PERMISSIVE'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND (btrim(COALESCE(qual, ''), '() ') = 'true'
      OR btrim(COALESCE(with_check, ''), '() ') = 'true')
),

-- 2. Tikslūs dublikatai: ta pati lentelė, komanda, rolės ir VIENODA sąlyga,
--    tik kitas vardas. Tai „trijų kartų“ palikimas — lietuviški vardai,
--    paskui `p1_*`, paskui trumpi priešdėliai. Elgsenai įtakos neturi, bet
--    būtent dėl jų politikų yra 128 ir rinkinio nebeįmanoma perskaityti.
dublikatai AS (
  SELECT
    2 AS sunkumas,
    'dublikatai' AS problema,
    tablename,
    cmd,
    string_agg(policyname, ' | ' ORDER BY policyname) AS detale,
    format('%s politikos su vienoda salyga - %s is ju perteklines',
           count(*), count(*) - 1) AS paaiskinimas
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY tablename, cmd, permissive, roles::text,
           COALESCE(qual, '-'), COALESCE(with_check, '-')
  HAVING count(*) > 1
),

-- 3. Lentelė su įjungtu RLS, bet be nė vienos politikos.
be_politiku AS (
  SELECT
    3 AS sunkumas,
    'RLS ijungtas be politiku' AS problema,
    c.relname AS tablename,
    '-' AS cmd,
    '-' AS detale,
    'lentele neprieinama per anon/authenticated' AS paaiskinimas
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname
    )
)

SELECT * FROM atviras_rasymas
UNION ALL
SELECT * FROM dublikatai
UNION ALL
SELECT * FROM be_politiku
ORDER BY sunkumas, tablename, cmd, detale;

-- ════════════════════════════════════════════════════════════════════════════
-- ETALONAS 2026-08-14, PRIEŠ VALYMĄ
-- ────────────────────────────────────────────────────────────────────────────
-- Paleista prieš pirmąją valymo migraciją. Jei vėliau eilučių padaugėja,
-- kažkas grąžino seną politiką atgal.
--
--   sunkumas 1 — 11 eiluciu:
--     company_settings       UPDATE  "Admins can update settings"
--     equipment_categories   INSERT / UPDATE / DELETE           (3)
--     site_extra_materials   INSERT / UPDATE                    (2)
--     site_file_annotations  INSERT / UPDATE / DELETE           (3)
--     teams                  ALL     "Leisti komandu valdyma"
--     user_profiles          UPDATE  "Leisti redagavima"
--
--   sunkumas 2 — 21 grupe (apie 24 perteklines politikos is 128).
--     Daugiausia: company_settings SELECT ir ALL po 3 vienodas.
--
--   sunkumas 3 — 0 eiluciu.
--
-- Po `20260814170000_lock_company_settings_writes.sql` laukiama:
--   sunkumas 1 — 10 eiluciu (dingsta company_settings);
--   sunkumas 2 — 21 grupe, nepakitusi (ta migracija dublikatu neliecia);
--   sunkumas 3 — 0.
-- ════════════════════════════════════════════════════════════════════════════
