# Reenpro montuotojas — instrukcijos dirbantiems

Skirta ir žmogui, ir kodo asistentams. **Pagrindinė taisyklė: jei sprendimas
yra tik pokalbyje, jo nėra.** Viskas, ką reikia žinoti rytoj, gyvena faile
arba commit'o žinutėje.

## Bendros Reenpro taisyklės gyvena kitoje repozitorijoje

`C:\Users\Aurimas\dev\reenpro-vidines-sistemos\AGENTS.md`

Ten: diegimo tvarka, Access sandara, `run_worker_first`, Windows aplinkos
spąstai, naujos programėlės kontrolinis sąrašas. **Perskaityti pirma.**
Dizaino sistema — ten pat, `REENPRO-dizaino-sistema.md`.

## Kas yra ši programėlė

Objektų darbai, kontroliniai sąrašai, nuotraukos ir laikas. Naudotojai:
montuotojai (mobili aplinka), projektų vadovai, darbų vadovas, tiekimas
(administracinė aplinka).

React 19 + Vite + Tailwind v4, ~190 failų. `src/pages/mobile` (14 failų) ir
`src/pages/admin` (72). `RoleRedirect` nusprendžia, kur žmogų nuvesti.

**Atlyginimai nuo 2026-08-14 atjungti.** Sprendimas produktinis, ne saugumo —
`payroll_*` lentelės RLS lygiu ir taip pasiekiamos tik adminams. Atjungta
trijose vietose: meniu punktas (`AdminLayout`), maršrutas ir `lazy` importas
(`App.tsx`), Skydelio „Payroll“ eilutės su užklausomis į `payroll_periods` bei
`payroll_site_snapshots` (`api/dashboard.ts`, `pages/admin/Dashboard.tsx`).
Kodas `src/pages/admin/payroll/` ir `src/api/payroll.ts` **paliktas vietoje ir
nepaliestas**; be maršruto jis nepatenka į paketą (patikrinta — `dist` nebeturi
Payroll gabalo). Grąžinti — atstatyti tas tris vietas.

## Kas kur laikoma

**Duomenys lieka Supabase** (projektas `zfntcsdijgclolanwlpp`). Perrašinėti į
D1 neverta: RLS turi 54 politikas, `auth.uid()` yra montuotojo eilutės ID, o
algų logika — apie 130 KB SQL. Klaidos ten kainuotų pinigais.

**Cloudflare prideda tik duris.** `worker/index.js` tikrina Access JWT ir D1
`users` lentelę (`APP_ID` = `installer`, `APP_GROUPS` tuščias — priskiriama
vardiniu būdu). Verslo duomenų Workeris neliečia.

Supabase MCP prijungtas per `.mcp.json` — **read-only**. Schemą ir RLS
skaityti iš jo, ne spėti iš 33 migracijų failų.

## Ko nesulaužyti

1. **`run_worker_first: true`** — be jos statiniai failai atiduodami
   nepaleidus prieigos patikros.
2. **`ACCESS_AUD` yra sąrašas** — Production ir Preview turi skirtingus `aud`.
3. **`not_found_handling: single-page-application`** — be jos atnaujinus
   puslapį ties `/objektai` būtų 404.
4. **Talpykla:** maišos failai metams, `index.html` ir `sw.js` — `no-store`.
   Sumaišius, žmonės liktų su sena programa.
5. **`.dev.vars` ir `.env` niekada į git.** 2026-05-18 į `gen.bat` buvo
   pakliuvęs Supabase žetonas ir išgulėjo istorijoje tris mėnesius.

## Dizainas

Tokenai — `src/index.css`. Reikšmės iš REENPRO dizaino sistemos: šviesi tema
iš 4 skyriaus, tamsi iš 15. **Keisti tik reikšmes, ne vardus** — komponentuose
tokenai naudojami apie 1 300 vietų.

- `--primary` yra **slyvinė**, ne ember. `bg-primary` naudojamas ~350 vietų;
  ember ten reikštų oranžinę programą, o sistema leidžia ember tik VIENAM
  svarbiausiam dalykui ekrane.
- `--accent` yra ember. Dedamas sąmoningai, po vieną veiksmą ekrane.
- `--on-accent` būtinas: tamsoje ember šviesus, tad tekstas ant jo turi būti
  tamsus (baltas duotų 2,6 : 1).
- Šoninė juosta visada slyvinė (`nav-*` tokenai), abiejose temose.
- Žalių Tailwind spalvų (`bg-zinc-*`, `text-green-*`) nebelikę — jei atsiranda,
  tai regresija.

## Paleidimas ir diegimas

```
CI=true npx pnpm install     # po aplanko perkėlimo pnpm nuorodos lūžta
CI=true npx pnpm build
CI=true npx pnpm test        # 228 testai, 31 failas
npx wrangler@4.120.0 versions upload
```

`wrangler@latest` 4.121.0 sugedęs (reikalauja nesamo `miniflare` alfa paketo)
— naudoti **4.120.0**.

Diegimas sustoja ties Preview ir laukia žmogaus patvirtinimo. Versijos ID
`versions deploy` komandai reikia **viso**, ne sutrumpinto.

## Kas dar nepadaryta

1. **Antras, viešas adresas montuotojams** — be Access. Jie neturi Microsoft
   paskyrų, o PWA už Access lūžta (sesija baigiasi, offline kariauja su
   nukreipimu). Programa jau yra PWA, tad atskiro parsisiunčiamo appo greičiausiai nereikia.
2. **Biuro pusėje paslėpti antrą prisijungimą** — Workeris jau žino patvirtintą
   el. paštą iš Access, tad gali paduoti paruoštą Supabase sesiją. RLS
   nekeičiama. Daryti prieš išdalinant žmonėms, ne prieš bandymą.
3. **Rolės viduje** — dabar `user_profiles.role` turi tik `admin` ir
   `installer`, tad tiekimas matytų algas. Naujos rolės gyvena Supabase, ne
   D1: RLS mato tik Supabase duomenis, o paslėptas mygtukas nėra apsauga.
   **Naujos `role` reikšmės neužteks:** objektų matomumas remiasi komanda
   (`can_access_site` tikrina `team_id`), ne role, tad nauja rolė be komandos
   nematys nieko, o su komanda matys tiek pat, kiek montuotojas. Reikia
   atskiro predikato. Žr. `supabase/RLS-PERZIURA.md`.
4. **RLS sutvarkymas** — planas etapais: `supabase/RLS-PERZIURA.md`. Esmė:
   politikų 128, visos `PERMISSIVE`, sudėtos trimis kartomis, ir senos
   `USING (true)` uždengia naujas `is_admin()`. Algų lentelės tvarkingos.
   **Valyti prieš dedant roles.** Dvi migracijos **pritaikytos 2026-08-16**:

   - `20260816120000_lock_storage_site_photos.sql` — svarbiausia buvo ši.
     `storage.objects` politika „Public Access“ buvo `ALL TO public`, tad
     objektų nuotraukas galėjo skaityti, keisti ir **trinti neprisijungęs**
     žmogus. Ta pati OR problema, tik `storage` schemoje, kurios pirmoji
     peržiūra netikrino.
   - `20260814170000_lock_company_settings_writes.sql` — uždarė
     `company_settings.iban` rašymą ne adminams.

   Matuoklis — `supabase/tests/rls_policy_invariants.sql`: struktūrinė
   patikra be fixture'ų, veikia ir per read-only MCP. Būsena **po** jų:
   **0 anoniminio rašymo, 1 storage be tapatybės, 10 atviro rašymo,
   21 dublikatų grupė, 0 lentelių be politikų.**

   Likusi storage eilutė — `site_files` („Leisti pilną priėjimą prie failų“).
   Jos uždaryti negalima, kol `src/api/sites.ts:314,340` skaito failus per
   `getPublicUrl`; tai kitas etapas kartu su kodo pataisa.

   **Migracijos taikomos ranka per SQL editorių.** `supabase_migrations`
   schemos bazėje nėra — visos 32 repozitorijos migracijos buvo sudėtos
   ranka, registro nėra. `supabase db push` bandytų sugroti visas iš naujo
   prieš bazę, kurioje viskas jau yra.

   **`rls_smoke_test.sql` čia nepakanka.** Bazėje tik 2 naudotojai (1 adminas,
   1 montuotojas), tad patikros, kurioms reikia dviejų skirtingų ne-adminų,
   tyliai praleidžiamos — įskaitant 2d, kuris turėjo įrodyti profilių skylę.
   Ankstesnė prognozė „2d kris“ buvo klaidinga: jis praleidžiamas. Skaitant to
   testo išvestį, **`[SKIP]` yra tokia pat svarbi eilutė kaip `[FAIL]`.**
5. **Pranešimas apie naują versiją** — dabar montuotojas gali savaitę dirbti su
   sena, nes service worker atiduoda iš talpyklos.
6. ~~Gilesnių ekranų apžiūra po spalvų pakeitimo~~ — padaryta 2026-08-14.
   Ataskaitos buvo švarios; Objekto kortelėje ir Atlyginimuose likę kietai
   įrašyti šviesios temos atspalviai perkelti į tokenus. Pridėtas
   `--danger-bg` (dizaino sistemos `error-bg`) — jo trūko, nors
   `success/warning/info` fonai jau buvo.
