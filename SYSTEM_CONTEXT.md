# Sistemų Architektūra ir Kontekstas (System Context)

Šis dokumentas skirtas dirbtinio intelekto asistentams bei naujiems kūrėjams, kad jie greitai suprastų "Installer-app" programos verslo logiką, duomenų struktūras ir priimtus architektūrinius sprendimus.

## Bendra Informacija
- **Frontend Stack:** React (Vite), TypeScript, Tailwind CSS
- **State Management:** Zustand (Global State/Auth), TanStack Query (Server State / Supabase Cache)
- **Backend/Database:** Supabase (PostgreSQL, Auth, Storage)

## Duomenų Struktūrų Ypatumai (Supabase)
- Objekto identifikavimui naudojamas stulpelis `code` (pvz. SITE-001) ir `client_name`. (Anksčiau buvo naudoti `project_code` ir `client_name`, todėl įsitikinkite, kad visos užklausos naudoja `code`).
- Kuriant objektus (`sites`), privalomas `system_type` laukas (pvz., 'PV', 'BESS', 'PV+BESS', 'OTHER').

## Verslo Logika ir Sprendimai

### 1. Rolėmis Paremtas Maršrutizavimas (Role-Based Routing)
Sistemoje yra dvi pagrindinės rolės: **`admin`** ir **`installer`**.
- Sėkmingai prisijungus (per `Supabase.auth`), naudotojo profilis nuskaitomas iš `user_profiles`.
- Pagal rolę, nukreipiama atitinkamai: `admin` -> `/admin`, `installer` -> `/mobile` (naudojant `<ProtectedRoute>`).
- Šakninis maršrutas (`/`) automatiškai nukreipia jau prisijungusį vartotoją į jam priklausantį modulį.

### 2. Administratoriaus Sąsaja (Admin View)
- **`CreateSiteModal`**: Išskirtas į atskirą komponentą (`src/components/admin/CreateSiteModal.tsx`), kad būtų išlaikytas vienas kodo šaltinis objektų kūrimui tiek Dashboard'e, tiek `Sites.tsx` (Visų objektų) lange.
- **Visi Objektai (`/admin/sites`)**: Atvaizduoja visus objektus su būsenų ženkliukais (`pending`, `in_progress`, `completed`, `paused`). Naudoja tą patį `CreateSiteModal` komponentą naujų objektų kūrimui.
- **Gyvas Laiko Stebėjimas**: `Dashboard.tsx` "Šiandien dirba" skiltyje naudojamas `LiveAdminTimer.tsx` komponentas, kuris priima atviro `time_entries` įrašo (`!e.end_time`) `start_time` reikšmę ir vizualiai realiu laiku skaičiuoja objekto trukmę. Jei atviro laiko įrašo nėra, UI rodo `0h 0min 0s`.

### 3. Montuotojo Sąsaja (Mobile / Installer View)
Montuotojams skirta sąsaja buvo specialiai pritaikyta taip, kad išvengtų nereikalingos informacijos, galinčios klaidinti (pvz., dirbto laiko skaičiavimo).

- **Laiko Sekimo Paslėpimas:** Montuotojams mokama už atliktą darbą (kW), o ne už valandas. Todėl visa laiko sekimo informacija (`weeklyHours`, suminis šios dienos laikas `SiteCard`) iš Montuotojo UI buvo pašalinta.
- **Nematomas Laiko Sekimas (Silent Tracking):**
  - **Laukia (Pending):** Kai paspaudžiamas "PRADĖTI DARBĄ", programėlė atnaujina objekto būseną į `in_progress` ir *tyliai* fone sukuria naują `time_entries` įrašą su dabartiniu `start_time`.
  - **Vykdomas (In Progress):** Mygtukai "PAUZĖ" ir "UŽBAIGTI DARBĄ" suranda atvirą fone veikiančią `time_entries` sesiją ir uždaro ją priskirdami `end_time = now()`. Admin skydelyje laikas skaičiuojamas teisingai, nors montuotojas jokio veikiančio laikmačio nemato.
- **Objektų Sąrašai ir Filtravimas:**
  - Rikiavimas pagal `scheduled_start` atliekamas **serverio pusėje** (`getInstallerSites` naudoja `.order('scheduled_start', { nullsFirst: false })`). Tai veikia, nes rikiuojama pagrindinė (`sites`) lentelė, o ne prijungta lentelė — būtent prijungtų lentelių `.order()` anksčiau neveikė ir vertė rikiuoti per `Array.sort()`. Kryptis perduodama per `{ ascending }` parametrą (Today.tsx – didėjančiai, Sites.tsx – mažėjančiai). Klientinis `Array.sort()` pašalintas.
  - **Filtravimas:** Visų objektų lange (`src/pages/mobile/Sites.tsx`) naudojami du atskiri būsenų (Status) ir laiko (Time) filtrai. Laiko rėžių nustatymui naudojama `date-fns` biblioteka (`isSameWeek`, `isSameMonth`).
- **Užduočių Sąrašas (Checklists):** 
  - Objekte (`SiteDetail.tsx`) užduotys sugrupuojamos į vieną "Darbai" skirtuką pagal fazes (`pre`, `during`, `post`).
  - Realiu laiku galima uždėti varnelę, kuri iš karto sinchronizuojama su `site_checklists` baze. Nuotraukų kėlimas automatiškai pažymi užduotį kaip atliktą ir priskiria "thumbnail" peržiūrą.

## Gerosios Praktikos / Svarbūs Niuansai
- **TanStack Query Invalidation**: Po kiekvienos mutacijos (pvz., laiko pauzės, objekto pradėjimo) būtinai naudojamas `queryClient.invalidateQueries()`, kad atnaujintų sąrašus be puslapio perkrovimo.
- **Būsenų (Status) Tipai**: `pending`, `in_progress`, `paused`, `completed`.
- **Klaidų Prevencija**: Kuriant komponentus (kaip `LiveAdminTimer`), visada tikrinama ar perduoti props'ai (kaip `startTime`) egzistuoja, jei ne - grąžinamas saugus fallback (pvz. `0h 0min 0s`).

---
*(Dokumentas paskutinį kartą atnaujintas AI Asistento, siekiant išsaugoti programos kontekstą ateities integracijoms)*
