-- ============================================================
-- Migracija: medžiagų katalogas, žiniaraščiai ir šablonai (1 etapas)
--
-- Sprendimas: `supabase/MEDZIAGU-EIGA.md`. Šis etapas apima TIK duomenis —
-- be būsenų eigos, be pranešimų ir be atsargų. Atsargų apskaitos apskritai
-- nebus: likučius seka Rivilė, o programa tik fiksuos sandėlio patvirtinimą.
--
-- ── KODĖL PLEČIAMAS `equipment_catalog`, o ne kuriamas naujas ────────────
--
-- Du katalogai reikštų, kad niekas nežino, į kurį vesti. Lentelės vardas po
-- šios migracijos tampa netikslus (joje bus ir kabelis), bet pervadinimas
-- palies `api/catalog.ts`, `EquipmentCatalog.tsx` ir `EquipmentTab` — tai
-- atskiras darbas, o ne šio etapo dalis.
--
-- Kataloge šiuo metu 5 įrašai, visi įranga (inverteriai, moduliai, kaupiklis).
-- Todėl `kind` visiems užpildomas kaip `equipment`, o naujiems numatytoji
-- reikšmė yra `material` — nuo šiol dažnesnis atvejis.
--
-- ── GEBĖJIMŲ PREDIKATAI ──────────────────────────────────────────────────
--
-- Politikos remiasi funkcijomis, ne vaidmenų vardais. Šiandien jos visos
-- grąžina `is_admin()`, nes kitų rolių dar nėra. Atsiradus `work_role`
-- teisėms, keičiamas **funkcijos kūnas**, o ne dešimtys politikų.
--
-- Būtent dėl to šiandien turime 126 politikas, kurių niekas nebeperskaito.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Katalogas
-- ────────────────────────────────────────────────────────────

-- `NOT NULL` dedamas trimis žingsniais, kad migracija būtų idempotentiška:
-- pakartotinis paleidimas užpildo tik tai, kas dar tuščia. Bazėje nėra
-- migracijų registro, tad pakartojimas yra realus scenarijus.
ALTER TABLE public.equipment_catalog ADD COLUMN IF NOT EXISTS unit      TEXT;
ALTER TABLE public.equipment_catalog ADD COLUMN IF NOT EXISTS code      TEXT;
ALTER TABLE public.equipment_catalog ADD COLUMN IF NOT EXISTS kind      TEXT;
ALTER TABLE public.equipment_catalog ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

UPDATE public.equipment_catalog SET unit      = 'vnt.'      WHERE unit      IS NULL;
UPDATE public.equipment_catalog SET kind      = 'equipment' WHERE kind      IS NULL;
UPDATE public.equipment_catalog SET is_active = TRUE        WHERE is_active IS NULL;

ALTER TABLE public.equipment_catalog
  ALTER COLUMN unit      SET NOT NULL,
  ALTER COLUMN kind      SET NOT NULL,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN unit      SET DEFAULT 'vnt.',
  ALTER COLUMN kind      SET DEFAULT 'material',
  ALTER COLUMN is_active SET DEFAULT TRUE;

DO $kind_chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_catalog_kind_chk') THEN
    ALTER TABLE public.equipment_catalog
      ADD CONSTRAINT equipment_catalog_kind_chk CHECK (kind IN ('equipment', 'material'));
  END IF;
END
$kind_chk$;

-- Rivilės kodas: neprivalomas (senų įrašų jo nėra), bet jei yra — unikalus.
-- Be unikalumo eksportas nurašymui dubliuotųsi, o klaida išlįstų buhalterijoje.
CREATE UNIQUE INDEX IF NOT EXISTS equipment_catalog_code_uniq
  ON public.equipment_catalog (code) WHERE code IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Gebėjimų predikatai
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_manage_catalog()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.is_admin(); $$;

CREATE OR REPLACE FUNCTION public.can_edit_material_list(p_site_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.is_admin(); $$;

COMMENT ON FUNCTION public.can_manage_catalog() IS
  'Kas tvarko katalogą ir šablonus. Atsiradus rolėms keičiamas kūnas, ne politikos.';
COMMENT ON FUNCTION public.can_edit_material_list(UUID) IS
  'Kas kuria ir keičia objekto žiniaraštį. Ateityje — inžinierius ir projektų vadovas.';

-- ────────────────────────────────────────────────────────────
-- 3. Šablonai
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.material_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  site_type   TEXT,                       -- NULL = tinka visiems
  system_type TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.material_template_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES public.material_templates(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES public.equipment_catalog(id) ON DELETE RESTRICT,
  qty             NUMERIC NOT NULL CHECK (qty >= 0),
  -- Dalis medžiagų fiksuotos, dalis auga su sistema. Be šito šablonas duotų
  -- sąrašą, kurį vis tiek tektų taisyti ranka: kabelio 5 kW ir 15 kW objektui
  -- reikia skirtingai.
  basis           TEXT NOT NULL DEFAULT 'fixed'
                  CHECK (basis IN ('fixed', 'per_kwp', 'per_panel', 'per_inverter')),
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS material_template_lines_template_idx
  ON public.material_template_lines (template_id);

-- ────────────────────────────────────────────────────────────
-- 4. Žiniaraštis
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_material_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  -- Būsenų rinkinys apibrėžiamas iš karto, nors 1 etape naudojamas tik
  -- `rengiamas`. Taip vėliau nereikės keisti apribojimo kartu su eiga.
  status      TEXT NOT NULL DEFAULT 'rengiamas'
              CHECK (status IN ('rengiamas', 'pateiktas', 'truksta', 'patvirtintas',
                                'isduota', 'faktas_suvestas', 'grazinta_taisyti',
                                'priimta', 'nurasyta')),
  version     INT NOT NULL DEFAULT 1,
  template_id UUID REFERENCES public.material_templates(id) ON DELETE SET NULL,
  created_by  UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS site_material_lists_site_version_uniq
  ON public.site_material_lists (site_id, version);

CREATE TABLE IF NOT EXISTS public.site_material_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id         UUID NOT NULL REFERENCES public.site_material_lists(id) ON DELETE CASCADE,
  catalog_item_id UUID REFERENCES public.equipment_catalog(id) ON DELETE RESTRICT,
  -- Laisvas vardas reikalingas tam, ką montuotojas suveda pats. Bet bent
  -- vienas iš dviejų privalo būti — eilutė be nieko yra šiukšlė.
  name            TEXT,
  unit            TEXT NOT NULL,
  -- `NULL` NĖRA tas pats, kas 0. Nulis reiškia „planuota nenaudoti“, o tuščia —
  -- „reikės, bet kiek dar nežinome“ (tipiškai DC kabelis).
  qty_planned     NUMERIC CHECK (qty_planned  >= 0),
  qty_issued      NUMERIC CHECK (qty_issued   >= 0),
  qty_actual      NUMERIC CHECK (qty_actual   >= 0),
  qty_returned    NUMERIC CHECK (qty_returned >= 0),
  note            TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT site_material_lines_identity_chk
    CHECK (catalog_item_id IS NOT NULL OR NULLIF(btrim(COALESCE(name, '')), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS site_material_lines_list_idx
  ON public.site_material_lines (list_id);

-- `updated_at` — naudojama jau esama `set_updated_at()`, savos nekuriame.
DO $trigeriai$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'material_templates_updated_at') THEN
    CREATE TRIGGER material_templates_updated_at BEFORE UPDATE ON public.material_templates
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'site_material_lists_updated_at') THEN
    CREATE TRIGGER site_material_lists_updated_at BEFORE UPDATE ON public.site_material_lists
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'site_material_lines_updated_at') THEN
    CREATE TRIGGER site_material_lines_updated_at BEFORE UPDATE ON public.site_material_lines
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$trigeriai$;

-- ────────────────────────────────────────────────────────────
-- 5. RLS — po VIENĄ politiką komandai, be dublikatų
-- ────────────────────────────────────────────────────────────
-- Sąmoningai nekartojame to, kas atvedė prie 126 politikų: jokių „p1_“ ir
-- lietuviškų dublikatų, jokių `USING (true)` rašymui.

ALTER TABLE public.material_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_template_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_material_lists     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_material_lines     ENABLE ROW LEVEL SECURITY;

-- Šablonai: skaito visi prisijungę (reikia generuojant), tvarko katalogo
-- tvarkytojas.
DROP POLICY IF EXISTS mt_select ON public.material_templates;
CREATE POLICY mt_select ON public.material_templates
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS mt_write ON public.material_templates;
CREATE POLICY mt_write ON public.material_templates
  FOR ALL TO authenticated
  USING (public.can_manage_catalog()) WITH CHECK (public.can_manage_catalog());

DROP POLICY IF EXISTS mtl_select ON public.material_template_lines;
CREATE POLICY mtl_select ON public.material_template_lines
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS mtl_write ON public.material_template_lines;
CREATE POLICY mtl_write ON public.material_template_lines
  FOR ALL TO authenticated
  USING (public.can_manage_catalog()) WITH CHECK (public.can_manage_catalog());

-- Žiniaraštis: matomas tiems, kas mato objektą; keičiamas pagal predikatą.
DROP POLICY IF EXISTS sml_select ON public.site_material_lists;
CREATE POLICY sml_select ON public.site_material_lists
  FOR SELECT TO authenticated USING (public.can_access_site(site_id));

DROP POLICY IF EXISTS sml_write ON public.site_material_lists;
CREATE POLICY sml_write ON public.site_material_lists
  FOR ALL TO authenticated
  USING (public.can_edit_material_list(site_id))
  WITH CHECK (public.can_edit_material_list(site_id));

DROP POLICY IF EXISTS smln_select ON public.site_material_lines;
CREATE POLICY smln_select ON public.site_material_lines
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.site_material_lists l
                 WHERE l.id = site_material_lines.list_id
                   AND public.can_access_site(l.site_id)));

DROP POLICY IF EXISTS smln_write ON public.site_material_lines;
CREATE POLICY smln_write ON public.site_material_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.site_material_lists l
                 WHERE l.id = site_material_lines.list_id
                   AND public.can_edit_material_list(l.site_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.site_material_lists l
                      WHERE l.id = site_material_lines.list_id
                        AND public.can_edit_material_list(l.site_id)));

-- ────────────────────────────────────────────────────────────
-- Savikontrolė
-- ────────────────────────────────────────────────────────────
DO $savikontrole$
DECLARE
  atviru INT;
  be_unit INT;
BEGIN
  -- Naujose lentelėse neturi būti nė vienos rašymo politikos su `true`.
  SELECT count(*) INTO atviru
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('material_templates', 'material_template_lines',
                      'site_material_lists', 'site_material_lines')
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND (btrim(COALESCE(qual, ''), '() ') = 'true'
      OR btrim(COALESCE(with_check, ''), '() ') = 'true');

  IF atviru > 0 THEN
    RAISE EXCEPTION 'naujose lentelese liko % atviru rasymo politiku', atviru;
  END IF;

  SELECT count(*) INTO be_unit FROM public.equipment_catalog WHERE unit IS NULL OR kind IS NULL;
  IF be_unit > 0 THEN
    RAISE EXCEPTION 'kataloge liko % irasu be unit arba kind', be_unit;
  END IF;

  RAISE NOTICE 'Katalogas praplestas, ziniarasciai ir sablonai sukurti, RLS uzdeta.';
END
$savikontrole$;

SELECT pg_notify('pgrst', 'reload schema');

-- ════════════════════════════════════════════════════════════
-- PATIKRINIMAS
-- ────────────────────────────────────────────────────────────
-- (a) Katalogas: 5 įrašai, visi `kind = 'equipment'`, `unit = 'vnt.'`:
--
--   select kind, unit, count(*) from public.equipment_catalog group by 1,2;
--
-- (b) `supabase/tests/rls_policy_invariants.sql` — skaičiai neturi pablogėti.
--     Naujos lentelės prideda 8 politikas (po 2 keturioms), visos su
--     predikatais, tad „atviras rasymas“ turi likti 7, o dublikatų 21.
--
-- (c) Sąsaja: Įrangos katalogas turi veikti kaip veikęs. `unit`, `code` ir
--     `kind` dar nerodomi — tai kito žingsnio darbas.
--
-- (d) Nė viena esama užklausa neturi lūžti: prie `equipment_catalog` tik
--     PRIDĖTA stulpelių, nė vienas nepašalintas ir nepervadintas.
-- ════════════════════════════════════════════════════════════
