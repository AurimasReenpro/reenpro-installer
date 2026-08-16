-- ============================================================
-- Migracija: pašalinti pastabas, kurių failo nebėra
--
-- PRIEŽASTIS. `site_file_annotations` eilutės niekada nebuvo trinamos kartu su
-- failu. `deletePhotoFromAllSources` savo komentare žadėjo išvalyti „all three
-- locations“, bet vietų yra keturios: `photos` eilutė, `photo_url` nuoroda,
-- failas saugykloje ir žymėjimai. Ketvirtos nedarė niekas.
--
-- Todėl kiekviena ištrinta nuotrauka palikdavo pastabą, rodančią į
-- nebeegzistuojantį failą. Iki 2026-08-16 to nesimatė, nes pastabos niekur
-- nebuvo rodomos; atsiradus „Montuotojų pastabos“ kortelei jos išlindo kaip
-- įrašai, kurių neįmanoma nei atidaryti, nei rasti.
--
-- Priežastis kode jau pataisyta (`removeFileAnnotations`), tad naujų
-- likučių nebeatsiras. Ši migracija tvarko tik senuosius.
--
-- KAIP ATSKIRIAMA. Žymėjimų `file_name` nėra vienodos formos:
--   • nuotraukoms tai PILNAS saugyklos kelias  — `<siteId>/gallery/xxx.jpg`;
--   • brėžiniams ir prisegtukams — tik failo vardas, o saugykloje objektas
--     vadinasi `<siteId>/<file_name>`.
-- Todėl tikrinami abu variantai. Tikrinta prieš rašant: taisyklė teisingai
-- atpažįsta visus 6 esamus įrašus.
--
-- KAS BUS PAŠALINTA (3 eilutės, 4 pastabos). Tekstai išsaugomi čia, kad
-- nedingtų be pėdsako:
--
--   objektas TEST2  · __dc_schema__.png                    · 2 žymėjimai
--       „Blabla“
--       „Habsh“
--   objektas 12345  · .../gallery/1780409160099_1kyw1p.jpg · 1 žymėjimas
--       „Truksta aplesinu“
--   objektas 12345  · ann_1b801aa6-…jpg (pastabos priedas) · 1 žymėjimas
--       „Aass“
--
-- Nė vienas iš šių failų saugykloje nebeegzistuoja, tad pastabų nebėra prie
-- ko pririšti — nuotraukos, kurią jos komentavo, nebeatkursi.
--
-- KAS LIEKA (3 eilutės, 17 žymėjimų): `__blueprint_54455354__.pdf`,
-- `Jevgenijus Tretjakovas…png` ir `…/gallery/1783448228438_7jar4s.jpg` —
-- visų trijų failai vietoje.
-- ============================================================

DO $valymas$
DECLARE
  pries   INT;
  po      INT;
  nutrinta INT;
BEGIN
  SELECT count(*) INTO pries FROM public.site_file_annotations;

  DELETE FROM public.site_file_annotations a
  WHERE NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.name = a.file_name
       OR o.name = a.site_id::text || '/' || a.file_name
  );

  GET DIAGNOSTICS nutrinta = ROW_COUNT;
  SELECT count(*) INTO po FROM public.site_file_annotations;

  -- Savikontrolė: jei staiga dingtų daugiau, nei tikimasi, geriau atsukti.
  -- Šiandien likučių yra 3; riba palikta 10, kad migracija nekristų dėl
  -- vieno naujo, bet kristų, jei sąlyga pasirodytų per plati.
  IF nutrinta > 10 THEN
    RAISE EXCEPTION 'per daug nutrinta: % eiluciu (buvo %, liko %)', nutrinta, pries, po;
  END IF;

  RAISE NOTICE 'Pasalinta % likuciu. Buvo %, liko %.', nutrinta, pries, po;
END
$valymas$;

-- ════════════════════════════════════════════════════════════
-- PATIKRINIMAS
-- ────────────────────────────────────────────────────────────
-- (a) Likučių neturi likti — ši užklausa turi grąžinti 0 eilučių:
--
--   select a.site_id, a.file_name from public.site_file_annotations a
--   where not exists (select 1 from storage.objects o
--                     where o.name = a.file_name
--                        or o.name = a.site_id::text || '/' || a.file_name);
--
-- (b) Sąsaja: Objekto kortelė → Objekto info → „Montuotojų pastabos“.
--     Objekte 12345 turi likti VIENA grupė su trimis pastabomis
--     („Pajungimo taškas“, „Grid port“, „Backup port“) ir jos miniatiūra.
--     Įrašai „Pastabos priedas / Aass“ ir „Truksta aplesinu“ turi dingti.
--
-- (c) Ateityje likučių nebeturi atsirasti: ištrynus nuotrauką biuro pusėje
--     arba mobiliojoje dalyje, jos pastabos dingsta kartu.
-- ════════════════════════════════════════════════════════════
