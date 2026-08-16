-- ============================================================
-- Migracija: ofiso medžiagos montuotojas netrina
--
-- SPRENDIMAS (2026-08-16): montuotojas neturi teisės trinti ofiso nuotraukų
-- ir dokumentų — tik juos žymėti.
--
-- KUR TA MEDŽIAGA GULI. Ne `site-photos`. Patikrinta: administracinėje pusėje
-- kėlimo į `site-photos` kodo apskritai nėra, o visos tos lentelės eilutės
-- priklauso montuotojui. Ofiso brėžiniai ir dokumentai gyvena **`site_files`**
-- (`BlueprintsTab`, `FilesTab`).
--
-- KAS BUVO. Ant `site_files` galiojo:
--
--   "Leisti pilną priėjimą prie failų"  ALL TO authenticated  USING (bucket_id = 'site_files')
--
-- Tikrinamas tik segtuvo vardas. Bet kuris prisijungęs galėjo perskaityti,
-- perrašyti ir **ištrinti visų objektų** brėžinius. Šalia buvo keturios
-- teisingos `site_files: …` politikos su `is_assigned_to_site`, bet jos nieko
-- nedarė — permissive politikos jungiamos per OR.
--
-- KODĖL NEUŽTENKA TIESIOG PALIKTI GRIEŽTĄSIAS. Jos leidžia trinti kiekvienam,
-- kas priskirtas objektui, t. y. ir montuotojui. Tai prieštarauja sprendimui.
--
-- KODĖL NEGALIMA TIESIOG UŽDRAUSTI MONTUOTOJUI RAŠYTI. Žymėjimų prisegtukai
-- keliami į TĄ PATĮ segtuvą: `src/api/sites.ts:309` formuoja kelią
-- `${siteId}/ann_${annotationId}__${laikas}_${uuid}.${plėtinys}`, o
-- `ImageAnnotator.removeAttachmentUrl` juos ir ištrina. Atėmus rašymą,
-- montuotojas nebegalėtų prisegti nuotraukos prie savo pastabos.
--
-- SPRENDIMAS. Skirti pagal vardą, nes kelio schema tai leidžia vienareikšmiai:
--   • `ann_*` antrame segmente — žymėjimo prisegtukas → montuotojas valdo;
--   • bet kas kita — ofiso medžiaga → tik adminas.
--
-- Patikrinta, kad esami failai atitinka schemą: segtuve trys objektai —
-- brėžinys `__blueprint_54455354__.pdf`, dokumentas su įprastu vardu ir
-- prisegtukas `ann_2a74bc40-…jpg`.
--
-- KO ŠI MIGRACIJA NEDARO. Nekeičia segtuvo į privatų. `site_files` skaitomas
-- per `getPublicUrl` (`api/sites.ts:314,340`), tad uždarius jį Brėžiniai ir
-- Failai nustotų veikti iš karto. Perėjimas prie pasirašytų nuorodų yra
-- atskiras žingsnis su kodo pakeitimu ir preview. Iki tol failai lieka
-- pasiekiami viešu adresu tam, kas žino kelią — bet jų bent nebeįmanoma
-- ištrinti ar pakeisti.
-- ============================================================

-- Laisvoji politika, nustelbusi visas kitas.
DROP POLICY IF EXISTS "Leisti pilną priėjimą prie failų" ON storage.objects;

-- Senoji karta: leido trinti ir keisti kiekvienam priskirtam objektui.
DROP POLICY IF EXISTS "site_files: trinti failus"     ON storage.objects;
DROP POLICY IF EXISTS "site_files: atnaujinti failus" ON storage.objects;
DROP POLICY IF EXISTS "site_files: įkelti failus"     ON storage.objects;

-- Skaitymas nekeičiamas — montuotojui brėžiniai reikalingi darbui.
-- ("site_files: matyti failus" paliekama kaip buvo.)

-- Įkėlimas: adminas bet ką; montuotojas tik savo žymėjimo prisegtuką.
CREATE POLICY sf_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site_files'
    AND (
      public.is_admin()
      OR (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.is_assigned_to_site(((storage.foldername(name))[1])::uuid)
        AND left(split_part(name, '/', 2), 4) = 'ann_'
      )
    )
  );

-- Trynimas: ta pati riba. Ofiso brėžinio montuotojas nepasieks.
CREATE POLICY sf_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'site_files'
    AND (
      public.is_admin()
      OR (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.is_assigned_to_site(((storage.foldername(name))[1])::uuid)
        AND left(split_part(name, '/', 2), 4) = 'ann_'
      )
    )
  );

-- Perrašymas: tik adminas. Montuotojo prisegtukai kuriami su unikaliu vardu
-- (laikas + uuid), tad jam perrašymo neprireikia.
CREATE POLICY sf_update ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'site_files' AND public.is_admin())
  WITH CHECK (bucket_id = 'site_files' AND public.is_admin());

-- ────────────────────────────────────────────────────────────
-- Savikontrolė
-- ────────────────────────────────────────────────────────────
DO $savikontrole$
DECLARE
  be_tapatybes INT;
  ar_skaito    INT;
BEGIN
  -- (a) Nebeturi likti `site_files` politikos, tikrinančios vien segtuvo vardą.
  SELECT count(*) INTO be_tapatybes
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND (qual LIKE '%site_files%' OR with_check LIKE '%site_files%')
    AND COALESCE(qual, '')       !~ 'is_admin|is_assigned_to_site'
    AND COALESCE(with_check, '') !~ 'is_admin|is_assigned_to_site';

  IF be_tapatybes > 0 THEN
    RAISE EXCEPTION 'site_files liko % politiku be tapatybes patikros', be_tapatybes;
  END IF;

  -- (b) Skaitymas turi IŠLIKTI, kitaip montuotojas nebematytų brėžinių.
  SELECT count(*) INTO ar_skaito
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'SELECT'
    AND COALESCE(qual, '') LIKE '%site_files%';

  IF ar_skaito = 0 THEN
    RAISE EXCEPTION 'neliko site_files skaitymo politikos - montuotojas nebematytu brezniu';
  END IF;

  RAISE NOTICE 'site_files: ofiso medziaga tik adminui, ann_* prisegtukai - priskirtiems.';
END
$savikontrole$;

SELECT pg_notify('pgrst', 'reload schema');

-- ════════════════════════════════════════════════════════════
-- PATIKRINIMAS
-- ────────────────────────────────────────────────────────────
-- (a) Invariantų testas: „storage be tapatybes patikros“ 1 → 0.
--     Tai buvo paskutinė to sunkumo eilutė.
--
-- (b) MONTUOTOJU:
--       • brėžinius ir failus MATO;
--       • prie pastabos prisega nuotrauką ir gali ją pašalinti;
--       • ofiso failo ištrinti NEGALI (sąsajoje tokio mygtuko jam ir nėra,
--         tad tikrinama per API arba pasitikima politika).
--
-- (c) ADMINU: brėžinių ir failų įkėlimas, pervadinimas ir trynimas veikia.
--
-- (d) Jei montuotojui nustotų veikti prisegtukų įkėlimas, pirmiausia
--     tikrinti kelio schemą: ji privalo būti `<siteId>/ann_<...>`.
-- ════════════════════════════════════════════════════════════
