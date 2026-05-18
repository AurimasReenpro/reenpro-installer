# RLS Saugumo Testavimo Planas (Test Plan)

Šis testavimo planas skirtas patikrinti, ar RLS (Row Level Security) politikos veikia teisingai. Jame pateikti du testų rinkiniai: vienas sėkmingiems scenarijams (Admin / Savininkas), kitas – blokuojamiems scenarijams (Neteisėta prieiga).

## 🟢 10 SQL Užklausų (Privalo Praeiti)
_Sąlyga: Užklausos leidžiamos su **Admin** arba atitinkamo **Installer** Auth kontekstu. Galite naudoti Supabase "Impersonate role" funkciją per SQL Editorių, norint veikti kaip konkretus vartotojas._

1. **[Admin] Visų objektų peržiūra:**
   ```sql
   SELECT * FROM sites;
   ```
   > **Rezultatas:** Turėtų grąžinti visus projektus/objektus sistemoje.

2. **[Installer A] Savo priskirtų objektų peržiūra:**
   ```sql
   SELECT * FROM sites;
   ```
   > **Rezultatas:** Turėtų grąžinti tik tuos objektus, prie kurių prijungtas Installer A per `site_assignments`.

3. **[Admin] Naujo objekto sukūrimas:**
   ```sql
   INSERT INTO sites (code, client_name, status) VALUES ('TEST-1', 'UAB Test', 'pending');
   ```
   > **Rezultatas:** Sėkmingai sukuriamas objektas.

4. **[Installer A] Savo laiko įrašo pradžia (INSERT):**
   ```sql
   INSERT INTO time_entries (site_id, installer_id, start_time) VALUES ('[PRISKIRTO_SITE_UUID]', auth.uid(), now());
   ```
   > **Rezultatas:** Sėkmingai sukuriamas laiko įrašas.

5. **[Installer A] Savo atviro laiko įrašo pabaiga (UPDATE):**
   ```sql
   UPDATE time_entries SET end_time = now() WHERE installer_id = auth.uid() AND end_time IS NULL;
   ```
   > **Rezultatas:** Sėkmingai uždaromas laiko įrašas.

6. **[Installer A] Priskirto Checklist statuso atnaujinimas:**
   ```sql
   UPDATE site_checklists SET is_completed = true WHERE site_id = '[PRISKIRTO_SITE_UUID]';
   ```
   > **Rezultatas:** Sėkmingai atnaujinamas laukas.

7. **[Visi] Šablonų peržiūra:**
   ```sql
   SELECT * FROM checklist_templates;
   ```
   > **Rezultatas:** Grąžina visus šablonus iš lentelės (prieiga atvira visiems prisijungusiems).

8. **[Installer A] Nuotraukos įkėlimas (INSERT į photos):**
   ```sql
   INSERT INTO photos (site_id, uploader_id, storage_path) VALUES ('[PRISKIRTO_SITE_UUID]', auth.uid(), 'test/path.jpg');
   ```
   > **Rezultatas:** Sėkmingai pridedamas įrašas.

9. **[Installer A] Savo profilio atnaujinimas:**
   ```sql
   UPDATE user_profiles SET full_name = 'Naujas Vardas' WHERE id = auth.uid();
   ```
   > **Rezultatas:** Vardas sėkmingai pakeičiamas.

10. **[Admin] Nuotraukos ištrynimas:**
    ```sql
    DELETE FROM photos WHERE id = '[PHOTO_UUID]';
    ```
    > **Rezultatas:** Įrašas sėkmingai ištrinamas.

---

## 🔴 10 SQL Užklausų (Privalo Būti Blokuotos)
_Sąlyga: Užklausos vykdomos iš **Installer** Auth konteksto, siekiant gauti svetimus duomenis ar teises._

1. **[Installer A] Kito montuotojo objektų peržiūra:**
   ```sql
   SELECT * FROM sites WHERE id = '[NEPRISKIRTO_SITE_UUID]';
   ```
   > **Rezultatas:** Turėtų grąžinti 0 eilučių (objektas paslėptas RLS politikos).

2. **[Installer A] Naujo objekto sukūrimas:**
   ```sql
   INSERT INTO sites (code, client_name) VALUES ('HACK', 'UAB Hack');
   ```
   > **Rezultatas:** RLS Policy Violation klaida.

3. **[Installer A] Svetimo objekto ištrynimas:**
   ```sql
   DELETE FROM sites WHERE id = '[BET_KOKIO_SITE_UUID]';
   ```
   > **Rezultatas:** RLS Policy Violation arba nulis paveiktų eilučių.

4. **[Installer A] Kito montuotojo laiko įrašų peržiūra:**
   ```sql
   SELECT * FROM time_entries WHERE installer_id != auth.uid();
   ```
   > **Rezultatas:** Turėtų grąžinti 0 eilučių.

5. **[Installer A] Laiko įrašo sukūrimas kitam montuotojui:**
   ```sql
   INSERT INTO time_entries (site_id, installer_id) VALUES ('[SITE_UUID]', '[KITO_INSTALLER_UUID]');
   ```
   > **Rezultatas:** RLS Policy Violation.

6. **[Installer A] Užbaigto (end_time IS NOT NULL) laiko įrašo modifikavimas:**
   ```sql
   UPDATE time_entries SET duration_minutes = 100 WHERE installer_id = auth.uid() AND end_time IS NOT NULL;
   ```
   > **Rezultatas:** Turėtų atnaujinti 0 eilučių, nes RLS update taisyklė reikalauja `end_time IS NULL`.

7. **[Installer A] Naujo priskyrimo (site_assignments) sukūrimas sau:**
   ```sql
   INSERT INTO site_assignments (site_id, installer_id) VALUES ('[SITE_UUID]', auth.uid());
   ```
   > **Rezultatas:** RLS Policy Violation klaida.

8. **[Installer A] Svetimo checklist atnaujinimas:**
   ```sql
   UPDATE site_checklists SET is_completed = true WHERE site_id = '[NEPRISKIRTO_SITE_UUID]';
   ```
   > **Rezultatas:** Turėtų atnaujinti 0 eilučių.

9. **[Installer A] Checklist šablono sukūrimas:**
   ```sql
   INSERT INTO checklist_templates (name, phase) VALUES ('Hacked Task', 'pre');
   ```
   > **Rezultatas:** RLS Policy Violation klaida.

10. **[Installer A] Kito vartotojo profilio redagavimas:**
    ```sql
    UPDATE user_profiles SET full_name = 'Hack' WHERE id != auth.uid();
    ```
    > **Rezultatas:** Turėtų atnaujinti 0 eilučių.
