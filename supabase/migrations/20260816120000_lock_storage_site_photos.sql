-- ============================================================
-- Migracija: uždaryti objektų nuotraukas (`site-photos`)
--
-- PRIEŽASTIS. `storage.objects` kartoja tą pačią „trijų kartų“ istoriją kaip
-- `public` schema, tik čia kaina didesnė. Ant `site-photos` yra devynios
-- politikos, ir dvi iš jų tikrina TIK segtuvo vardą:
--
--   "Public Access"                          ALL    TO public         USING (bucket_id = 'site-photos')
--   "Leisti prisijungusiems matyti nuotraukas" SELECT TO authenticated USING (bucket_id = 'site-photos')
--
-- Pirmoji yra rimčiausia rasta skylė. `public` rolė Postgres'e apima `anon`,
-- t. y. NEPRISIJUNGUSĮ naudotoją. `FOR ALL` be atskiro `WITH CHECK` reiškia,
-- kad `USING` taikomas ir įterpimui. Praktiškai bet kas galėjo skaityti,
-- įkelti, perrašyti ir **ištrinti** montavimo įrodymus.
--
-- Antroji leidžia bet kuriam prisijungusiam matyti VISŲ objektų nuotraukas,
-- nepaisant komandos ar priskyrimo.
--
-- Šalia jų yra visiškai teisingos `p1_sitephotos_*` politikos, tikrinančios
-- `is_admin() OR is_assigned_to_site(foldername(name)[1])`. Jos nieko nedarė:
-- permissive politikos jungiamos per OR, tad laisviausia nustelbia visas.
--
-- Rasta 2026-08-16 tikrinant, ar pritaikyta ankstesnė RLS migracija.
--
-- TAISYMAS. Šalinamos tos dvi politikos ir segtuvas paverčiamas privačiu.
-- Vien politikų neužtenka: kol `storage.buckets.public = true`, objektai
-- atiduodami viešu adresu apskritai neklausiant RLS.
--
-- KAS PALIEKAMA. Visos likusios septynios `site-photos` politikos. Jos
-- teisingos, o dvi kartos (`p1_sitephotos_*` ir senesnės „…storage
-- nuotraukas“) viena kitos nedubliuoja tiksliai: trynimo taisyklės skiriasi
-- (priskyrimas prie objekto vs. įkėlėjas per `photos.installer_id`). Jų
-- sutvarkymas yra dublikatų etapas, ne šio taisymo dalis.
--
-- KO ŠI MIGRACIJA SĄMONINGAI NEDARO. Neliečia `site_files`, nors politika
-- "Leisti pilną priėjimą prie failų" (ALL TO authenticated, tik `bucket_id`)
-- yra tokia pat yda: bet kuris prisijungęs mato ir gali ištrinti visų objektų
-- brėžinius. Jos uždaryti dabar negalima, nes `src/api/sites.ts` (314 ir 340
-- eilutės) skaito failus per `getPublicUrl`, ir uždarius segtuvą Brėžiniai su
-- Failais nustotų veikti. Tas žingsnis daromas kartu su kodo pataisa į
-- pasirašytas nuorodas.
--
-- `branding` neliečiamas: logotipas rodomas prisijungimo lange dar prieš
-- autentifikaciją, tad "Visi mato logotipą" TO public ten yra sąmoningas.
--
-- POVEIKIS SĄSAJAI — patikrinta prieš rašant:
--   • `site-photos` niekur neskaitomas per `getPublicUrl`. Visos vietos
--     naudoja `createSignedUrl` / `createSignedUrls` (`useSignedPhotoUrl`,
--     `useSignedPhotoUrls`, `api/sites.ts:610`, `WorkTab`, `helpers.ts`).
--   • Senų įrašų su pilnu `https://` adresu nėra: `photos.storage_path`
--     0 iš 5, `site_checklist_items.photo_url` 0 iš 4. Visi keliai — grynos
--     nuorodos, tinkamos pasirašymui.
-- Todėl segtuvo uždarymas nuotraukų programoje nesulaužo.
--
-- KĄ TAI SULAUŽO SĄMONINGAI: bet kokia anksčiau iš rankų į rankas perduota
-- vieša nuotraukos nuoroda nustos veikti. Segtuve 13 objektų.
--
-- DĖMESIO DĖL TEISIŲ. `storage.objects` priklauso `supabase_storage_admin`,
-- todėl `DROP POLICY` gali nepavykti su „must be owner of table objects“.
-- Supabase SQL editorius paprastai turi pakankamai teisių; jei ne —
-- žr. atsarginį variantą patikrinimo bloke faile apačioje.
-- ============================================================

-- 1. Anoniminė skylė.
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

-- 2. Bet kuriam prisijungusiam matomos visos nuotraukos.
DROP POLICY IF EXISTS "Leisti prisijungusiems matyti nuotraukas" ON storage.objects;

-- 3. Segtuvas privatus. Be šito politikos nieko nereiškia viešam adresui.
UPDATE storage.buckets SET public = false WHERE id = 'site-photos';

-- ────────────────────────────────────────────────────────────
-- Savikontrolė. Nutraukiama atsukant, jei liktų `site-photos` politika be
-- naudotojo patikros, arba jei per klaidą nebeliktų nė vienos teisingos —
-- tada montuotojai nebematytų savo objektų nuotraukų, o tai išlįstų tik gyvai.
-- ────────────────────────────────────────────────────────────
DO $savikontrole$
DECLARE
  liko TEXT;
  teisingu INT;
  ar_viesas BOOLEAN;
BEGIN
  SELECT string_agg(format('%s (%s, %s)', policyname, cmd, roles::text), ', ')
  INTO liko
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND permissive = 'PERMISSIVE'
    AND (qual LIKE '%site-photos%' OR with_check LIKE '%site-photos%')
    AND COALESCE(qual, '') NOT LIKE '%is_admin()%'
    AND COALESCE(with_check, '') NOT LIKE '%is_admin()%';

  IF liko IS NOT NULL THEN
    RAISE EXCEPTION 'site-photos liko politiku be naudotojo patikros: %', liko;
  END IF;

  SELECT count(*) INTO teisingu
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND (qual LIKE '%site-photos%' OR with_check LIKE '%site-photos%');

  IF teisingu < 4 THEN
    RAISE EXCEPTION 'site-photos liko tik % politikos - nusluota per daug, montuotojai nebematytu nuotrauku', teisingu;
  END IF;

  SELECT public INTO ar_viesas FROM storage.buckets WHERE id = 'site-photos';
  IF ar_viesas IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'site-photos segtuvas liko viesas - politikos viesam adresui negalioja';
  END IF;

  RAISE NOTICE 'site-photos uzdarytas: % politikos, segtuvas privatus.', teisingu;
END
$savikontrole$;

-- ════════════════════════════════════════════════════════════
-- PATIKRINIMAS
-- ────────────────────────────────────────────────────────────
-- (a) Politikų inventorius — nė vienos su `{public}` role ir nė vienos,
--     tikrinančios tik `bucket_id`:
--
--   select policyname, cmd, roles::text, qual from pg_policies
--   where schemaname='storage' and tablename='objects'
--     and (qual like '%site-photos%' or with_check like '%site-photos%')
--   order by cmd, policyname;
--
-- (b) `supabase/tests/rls_policy_invariants.sql` — po šios migracijos jis
--     papildytas ir `storage` schema, tad `site-photos` eilutės turi dingti.
--
-- (c) Sąsaja, ADMINU: Objekto kortelė → Kontrolinis sąrašas → nuotraukos
--     matosi; Brėžiniai ir Failai veikia kaip veikę (jų neliečiam).
--
-- (d) Sąsaja, MONTUOTOJU (mobilioji dalis): savo objekto nuotraukos matosi,
--     naujos įkeliamos. Tai svarbiausia patikra — būtent montuotojo kelias
--     eina per `is_assigned_to_site`, o ne per admino šaką.
--
-- (e) Neigiama patikra: atsidaryti nuotraukos viešą adresą inkognito lange
--     (`/storage/v1/object/public/site-photos/<kelias>`). Turi grąžinti
--     klaidą, ne paveikslėlį. Prieš migraciją grąžindavo paveikslėlį.
--
-- ATSARGINIS VARIANTAS, jei `DROP POLICY` neleidžia teisės:
--   Supabase Dashboard → Storage → Policies → `site-photos` → ištrinti
--   „Public Access“ ir „Leisti prisijungusiems matyti nuotraukas“ ranka,
--   o segtuvą perjungti į privatų per Storage → Buckets → Edit.
-- ════════════════════════════════════════════════════════════
