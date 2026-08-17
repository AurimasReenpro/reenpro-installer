-- ============================================================
-- Migracija: objekto įranga perkeliama į medžiagų žiniaraštį
--
-- PRIEŽASTIS. Objekto kortelėje buvo du skirtukai apie tą patį dalyką — kas
-- patenka į objektą. „Įranga“ gyveno `sites.equipment_details` jsonb lauke,
-- „Medžiagos“ — `site_material_lines`. Inverteris ir kabelis skiriasi rūšimi,
-- ne prigimtimi, todėl sąrašas turi būti vienas.
--
-- Praktinės pasekmės, dėl kurių tai daroma dabar:
--   • vienas šablonas gali sudėti ir modulius, ir spaustukus;
--   • montuotojas faktą ves vienoje vietoje, ne dviejose;
--   • nurašymo eksportas savaime apims viską;
--   • patvirtinimas patvirtins VISĄ žiniaraštį, o ne jo pusę.
--
-- APIMTIS. 11 įrangos eilučių šešiuose objektuose (išmatuota prieš rašant).
--
-- SUSIEJIMAS SU KATALOGU. `equipment_details.model` laikomas pilnas vardas
-- („Sunpower P7 555W“), o kataloge tai išskaidyta į `brand` + `model`. Todėl
-- lyginama sujungus. Patikrinta: sutampa 10 iš 11 eilučių.
--
-- Vienintelė nesutampanti — „Sigenergy TP2 12 kW“, kai kataloge yra
-- „Sigenergy TP2“. Ji perkeliama kaip laisvo teksto eilutė; biuras vėliau
-- susies rankomis arba papildys katalogą. Spėlioti panašumo nebandome —
-- klaidingas susiejimas blogiau nei nesusietas vardas.
--
-- KO ŠI MIGRACIJA NEDARO. `sites.equipment_details` **neliečiamas ir
-- netrinamas**. Stulpelis lieka kaip atsarginė kopija ir kaip atsarginis
-- šaltinis šablonų skaičiavimams, kol persitvarkys sąsaja. Jei kas nors būtų
-- ne taip, duomenys tebėra vietoje.
-- ============================================================

DO $perkelimas$
DECLARE
  r            RECORD;
  v_list_id    UUID;
  v_catalog_id UUID;
  v_unit       TEXT;
  v_model      TEXT;
  n_lists      INT := 0;
  n_lines      INT := 0;
  n_matched    INT := 0;
  n_skipped    INT := 0;
BEGIN
  FOR r IN
    SELECT s.id AS site_id, i AS item
    FROM public.sites s,
         LATERAL jsonb_array_elements(s.equipment_details::jsonb) AS i
    WHERE s.equipment_details IS NOT NULL
      AND jsonb_typeof(s.equipment_details::jsonb) = 'array'
    ORDER BY s.id
  LOOP
    v_model := btrim(COALESCE(r.item->>'model', ''));
    CONTINUE WHEN v_model = '';

    -- Žiniaraštis: imamas naujausias arba sukuriamas.
    SELECT id INTO v_list_id
    FROM public.site_material_lists
    WHERE site_id = r.site_id
    ORDER BY version DESC
    LIMIT 1;

    IF v_list_id IS NULL THEN
      INSERT INTO public.site_material_lists (site_id) VALUES (r.site_id)
      RETURNING id INTO v_list_id;
      n_lists := n_lists + 1;
    END IF;

    -- Katalogo atitikmuo pagal sujungtą „gamintojas modelis“.
    SELECT c.id, c.unit INTO v_catalog_id, v_unit
    FROM public.equipment_catalog c
    WHERE btrim(c.brand || ' ' || c.model) = v_model
    LIMIT 1;

    -- Idempotencija: bazėje nėra migracijų registro, tad pakartotinis
    -- paleidimas yra realus scenarijus. Ta pati eilutė antrą kartą
    -- nededama.
    IF EXISTS (
      SELECT 1 FROM public.site_material_lines l
      WHERE l.list_id = v_list_id
        AND ((v_catalog_id IS NOT NULL AND l.catalog_item_id = v_catalog_id)
          OR (v_catalog_id IS NULL AND btrim(COALESCE(l.name, '')) = v_model))
    ) THEN
      n_skipped := n_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.site_material_lines
      (list_id, catalog_item_id, name, unit, qty_planned, note)
    VALUES (
      v_list_id,
      v_catalog_id,
      CASE WHEN v_catalog_id IS NULL THEN v_model ELSE NULL END,
      COALESCE(v_unit, NULLIF(btrim(COALESCE(r.item->>'unit', '')), ''), 'vnt.'),
      NULLIF(btrim(COALESCE(r.item->>'quantity', '')), '')::NUMERIC,
      'Perkelta iš objekto įrangos'
    );

    n_lines := n_lines + 1;
    IF v_catalog_id IS NOT NULL THEN n_matched := n_matched + 1; END IF;
    v_catalog_id := NULL;
    v_unit := NULL;
  END LOOP;

  RAISE NOTICE 'Perkelta % eiluciu (% susietos su katalogu), sukurta % ziniarasciu, praleista % jau esanciu.',
    n_lines, n_matched, n_lists, n_skipped;
END
$perkelimas$;

-- ────────────────────────────────────────────────────────────
-- Savikontrolė
-- ────────────────────────────────────────────────────────────
DO $savikontrole$
DECLARE
  jsonb_eiluciu INT;
  perkeltu      INT;
BEGIN
  SELECT count(*) INTO jsonb_eiluciu
  FROM public.sites s, LATERAL jsonb_array_elements(s.equipment_details::jsonb) AS i
  WHERE s.equipment_details IS NOT NULL
    AND jsonb_typeof(s.equipment_details::jsonb) = 'array'
    AND btrim(COALESCE(i->>'model', '')) <> '';

  SELECT count(*) INTO perkeltu
  FROM public.site_material_lines
  WHERE note = 'Perkelta iš objekto įrangos';

  IF perkeltu < jsonb_eiluciu THEN
    RAISE EXCEPTION 'perkelta tik % is % irangos eiluciu', perkeltu, jsonb_eiluciu;
  END IF;

  RAISE NOTICE 'Patikra: % irangos eiluciu jsonb lauke, % perkelta i ziniarascius.',
    jsonb_eiluciu, perkeltu;
END
$savikontrole$;

SELECT pg_notify('pgrst', 'reload schema');

-- ════════════════════════════════════════════════════════════
-- PATIKRINIMAS
-- ────────────────────────────────────────────────────────────
-- (a) Perkeltos eilutės su nuoroda, ar susietos su katalogu:
--
--   select s.code, coalesce(c.brand || ' ' || c.model, l.name) as pavadinimas,
--          l.qty_planned, l.unit, l.catalog_item_id is not null as susieta
--   from public.site_material_lines l
--   join public.site_material_lists ml on ml.id = l.list_id
--   join public.sites s on s.id = ml.site_id
--   left join public.equipment_catalog c on c.id = l.catalog_item_id
--   where l.note = 'Perkelta iš objekto įrangos'
--   order by s.code;
--
--   Laukiama 11 eilučių, iš jų 10 susietų. Nesusieta turi būti viena —
--   „Sigenergy TP2 12 kW“ objekte 3220.
--
-- (b) Paleidus DAR KARTĄ nieko naujo neatsiranda: pranešime „praleista“
--     skaičius turi būti lygus perkeltų skaičiui, o eilučių kiekis
--     nepasikeisti.
--
-- (c) `sites.equipment_details` nepakitęs — tai sąmoninga atsarginė kopija.
-- ════════════════════════════════════════════════════════════
