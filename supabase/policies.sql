-- supabase/policies.sql

-- ==========================================
-- 1. Pagalbinės funkcijos (Helper functions)
-- ==========================================

-- Patikrina, ar dabartinis vartotojas turi 'admin' rolę
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Patikrina, ar dabartinis vartotojas (montuotojas) yra priskirtas konkrečiam objektui
CREATE OR REPLACE FUNCTION public.is_assigned_to_site(site_id_param UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.site_assignments
    WHERE site_id = site_id_param AND installer_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.sites s
    JOIN public.user_profiles up ON s.team_id = up.team_id
    WHERE s.id = site_id_param AND up.id = auth.uid() AND s.team_id IS NOT NULL
  );
END;
$$;

-- ==========================================
-- 2. Įjungiame RLS visoms lentelėms
-- ==========================================
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3. Politikos pagal lentelę ir rolę
-- ==========================================

-- ------------------------------------------
-- LENTELĖ: sites
-- ------------------------------------------

-- SELECT: admin (visus) ARBA installer (tik priskirtus)
CREATE POLICY "Leisti matyti objektus adminams ir priskirtiems montuotojams" ON sites
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR public.is_assigned_to_site(id)
  );

-- INSERT/DELETE: TIK admin (Update skaidomas į du atskirus)
CREATE POLICY "Leisti kurti ir trinti objektus tik adminams" ON sites
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- UPDATE: installer gali UPDATE TIK savo priskirtam objektui
CREATE POLICY "Leisti montuotojams atnaujinti tik savo objektus" ON sites
  FOR UPDATE
  TO authenticated
  USING (public.is_assigned_to_site(id))
  WITH CHECK (public.is_assigned_to_site(id));
-- PASTABA: PostgREST (Supabase) by default neduoda stulpelių lygio RLS apribojimų policy viduje.
-- Norint apriboti, kad montuotojas keistų TIK "status", "actual_start" ir "actual_end" laukus,
-- reikia naudoti REVOKE/GRANT ant konkrečių stulpelių duomenų bazės lygyje arba sukurti trigerį.

-- ------------------------------------------
-- LENTELĖ: time_entries
-- ------------------------------------------

-- SELECT: admin (visus) ARBA installer (tik savo entries)
CREATE POLICY "Leisti matyti laiką adminams arba savininkams" ON time_entries
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR installer_id = auth.uid());

-- INSERT: installer su WITH CHECK (installer_id = auth.uid())
CREATE POLICY "Leisti kurti laiko įrašus tik sau" ON time_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (installer_id = auth.uid() OR public.is_admin());

-- UPDATE: installer (tik savo open entries, t.y. end_time IS NULL)
CREATE POLICY "Leisti atnaujinti tik savo atvirus laiko įrašus" ON time_entries
  FOR UPDATE
  TO authenticated
  USING (installer_id = auth.uid() AND end_time IS NULL)
  WITH CHECK (installer_id = auth.uid());

-- DELETE: TIK admin
CREATE POLICY "Leisti trinti laiko įrašus tik adminams" ON time_entries
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ------------------------------------------
-- LENTELĖ: site_assignments
-- ------------------------------------------

-- SELECT: admin (visus) ARBA installer (tik savo eilutes)
CREATE POLICY "Leisti matyti priskyrimus adminams arba sau" ON site_assignments
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR installer_id = auth.uid());

-- INSERT/UPDATE/DELETE: TIK admin
CREATE POLICY "Leisti valdyti priskyrimus tik adminams" ON site_assignments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------
-- LENTELĖ: site_checklists
-- ------------------------------------------

-- SELECT: admin ARBA installer (tik priskirto objekto check'us)
CREATE POLICY "Leisti matyti checklists adminams ir priskirtiems montuotojams" ON site_checklists
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_assigned_to_site(site_id));

-- UPDATE: installer (tik priskirto objekto)
CREATE POLICY "Leisti atnaujinti checklists tik priskirtiems montuotojams" ON site_checklists
  FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR public.is_assigned_to_site(site_id))
  WITH CHECK (public.is_admin() OR public.is_assigned_to_site(site_id));

-- INSERT/DELETE: TIK admin
CREATE POLICY "Leisti kurti ir trinti checklists tik adminams" ON site_checklists
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Leisti trinti checklists tik adminams_del" ON site_checklists
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ------------------------------------------
-- LENTELĖ: checklist_templates & checklist_categories
-- ------------------------------------------

-- SELECT: visi authenticated
CREATE POLICY "Leisti visiems matyti šablonus" ON checklist_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leisti visiems matyti kategorijas" ON checklist_categories
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE: TIK admin
CREATE POLICY "Valdyti šablonus tik adminams" ON checklist_templates
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Valdyti kategorijas tik adminams" ON checklist_categories
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------
-- LENTELĖ: photos
-- ------------------------------------------

-- SELECT: admin ARBA installer (priskirto objekto foto)
CREATE POLICY "Matyti nuotraukas adminams ir priskirtiems montuotojams" ON photos
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_assigned_to_site(site_id));

-- INSERT: installer (priskirto objekto, installer_id = auth.uid())
CREATE POLICY "Kelti nuotraukas tik savo objektui" ON photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin() OR 
    (public.is_assigned_to_site(site_id) AND uploader_id = auth.uid())
  );

-- DELETE: installer (TIK savo foto) ARBA admin
CREATE POLICY "Trinti nuotraukas tik savo arba adminams" ON photos
  FOR DELETE
  TO authenticated
  USING (public.is_admin() OR uploader_id = auth.uid());

-- ------------------------------------------
-- LENTELĖ: user_profiles
-- ------------------------------------------

-- SELECT: visi authenticated (reikalinga dropdown'ams)
CREATE POLICY "Visi mato profilius" ON user_profiles
  FOR SELECT TO authenticated USING (true);

-- UPDATE: TIK savo profilį
CREATE POLICY "Redaguoti tik savo profilį" ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
-- PASTABA: Griežtai role apsaugai rekomenduojama pridėti trigerį, kuris neleidžia updatinti "role" lauko,
-- arba pasitelkti Supabase Security Definer funkcijas ir atimti UPDATE teisę iš vartotojo "role" stulpeliui.

-- ==========================================
-- 4. Storage RLS (bucket: site-photos)
-- ==========================================

-- SELECT: installer (priskirto objekto path'as) ARBA admin
CREATE POLICY "Matyti storage nuotraukas" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'site-photos' AND (
      public.is_admin() OR 
      public.is_assigned_to_site(CAST(split_part(name, '/', 1) AS UUID))
    )
  );

-- INSERT: installer (path'as turi prasidėti site_id, kurį turi priskirtą)
CREATE POLICY "Įkelti storage nuotraukas" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'site-photos' AND (
      public.is_admin() OR 
      public.is_assigned_to_site(CAST(split_part(name, '/', 1) AS UUID))
    )
  );

-- DELETE: admin ARBA installer (savo foto)
CREATE POLICY "Trinti storage nuotraukas" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'site-photos' AND (
      public.is_admin() OR 
      EXISTS (
        SELECT 1 FROM public.photos 
        WHERE storage_path = name AND uploader_id = auth.uid()
      )
    )
  );
