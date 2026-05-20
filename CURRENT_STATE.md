# Current State & Session Wrap-up (2026-05-19)

Šis dokumentas aprašo esamą projekto architektūrinę būseną, atliktus pakeitimus ir sutartą rytojaus veiksmų planą.

---

## 1. Esama kodo architektūra ir naujai įdiegti sprendimai

### 🚀 Globali Promise-based `useConfirm` sistema
- **Failai:**
  - [ConfirmContext.ts](file:///C:/Users/Aurimas/OneDrive%20-%20Reenpro%20UAB/Dokumentai/GitHub/Installer-app/src/context/ConfirmContext.ts) — konteksto deklaracija ir tipai.
  - [useConfirm.ts](file:///C:/Users/Aurimas/OneDrive%20-%20Reenpro%20UAB/Dokumentai/GitHub/Installer-app/src/hooks/useConfirm.ts) — hook'as lengvam modalo iškvietimui: `const ok = await confirm({ title: '...', message: '...' })`.
  - [ConfirmProvider.tsx](file:///C:/Users/Aurimas/OneDrive%20-%20Reenpro%20UAB/Dokumentai/GitHub/Installer-app/src/providers/ConfirmProvider.tsx) — būsenos valdymas, kuris programiškai išsprendžia arba atmeta atidaryto modalo Promise per `resolverRef`.
  - [ConfirmModal.tsx](file:///C:/Users/Aurimas/OneDrive%20-%20Reenpro%20UAB/Dokumentai/GitHub/Installer-app/src/components/ui/ConfirmModal.tsx) — modalinio lango UI komponentas.
- **Ypatybės:**
  - **Klaviatūros valdymas:** Palaiko `Enter` (patvirtinti) ir `Escape` (atšaukti).
  - **Karštasis pataisymas (Hotfix 2.2.1):** Paspaudimai izoliuoti naudojant `e.preventDefault()` ir `e.stopPropagation()` capturing fazėje (`true`), kad būtų išvengta dvigubo įvykio iššaukimo (ghost clicks) ant po apačia esančių fokusuotų elementų.
  - **Animacijos:** Apgaubtas su `framer-motion` `<AnimatePresence>` ir `<motion.div>`. Tamsus fonas sklandžiai pradingsta/atsiranda, o modalas turi elastingą spring iššokimo efektą (`bounce: 0.3`, `duration: 0.4`).

### 🛡️ Zustand `useSyncStore` ir Logout Guard
- **Failai:**
  - [useSyncStore.ts](file:///C:/Users/Aurimas/OneDrive%20-%20Reenpro%20UAB/Dokumentai/GitHub/Installer-app/src/stores/useSyncStore.ts) — saugo fono sinchronizacijos (`isSyncing`) ir aktyvių kėlimų (`activeUploads`) skaitiklio būsenas.
  - [usePhotoUpload.ts](file:///C:/Users/Aurimas/OneDrive%20-%20Reenpro%20UAB/Dokumentai/GitHub/Installer-app/src/hooks/usePhotoUpload.ts) — kėlimo metu iškviečia `startSync()` ir `finishSync()` (`finally` bloke).
  - [useAuth.ts](file:///C:/Users/Aurimas/OneDrive%20-%20Reenpro%20UAB/Dokumentai/GitHub/Installer-app/src/hooks/useAuth.ts) — `logout` funkcija blokuoja atsijungimą, jei fone dar vyksta kėlimas (`isSyncing === true`), ir parodo `toast.warning(...)`.

### 🎨 Standartizuota `lucide-react` ikonų sistema
- Visiškai išvalytos ir ištrintos senos ikonų bibliotekos (pvz., `@heroicons/react`, `react-icons`, `@fortawesome/`, Google Material Symbols šriftai).
- Visi komponentai naudoja tiesiogines modernias ir minimalistiškas `lucide-react` ikonas, pritaikant tinkamus dydžius ir sukamąsias animacijas (`animate-spin`) krovimosi indikatoriams.

---

## 2. Kritiniai fono procesų ir UX pataisymai

### ⏱️ Griežta laiko fiksavimo logika (`timeTracking.ts`)
- **Failas:** [timeTracking.ts](file:///C:/Users/Aurimas/OneDrive%20-%20Reenpro%20UAB/Dokumentai/GitHub/Installer-app/src/api/timeTracking.ts).
- **Sprendimas:**
  - `startWork(siteId)`: teisingai įterpia (INSERT) naują įrašą į `time_entries` su `start_time` ir priskiria vartotojo ID. Atnaujina objekto būseną į `in_progress`. Jei objekto `actual_start` yra NULL, nustato jį į dabartinį laiką.
  - `completeWork(siteId)`: Jei objektas užbaigiamas iškart (nepradėjus darbo fone), automatiškai užpildo `actual_start` ir įterpia uždarytą laiko įrašą. Taip pat suranda visus aktyvius time_entries (`end_time IS NULL`) ir juos uždaro.
  - **Duomenų sinchronizavimas:** Atlikus būsenos pakeitimus, sėkmingai invaliduojami užklausų raktai (`admin_activity_feed`, `admin_dashboard_stats`, `admin_active_sites_online`), kas užtikrina gyvą ir realaus laiko duomenų atnaujinimą Admin skydelyje.

### 📱 Automatinė navigacija mobiliame vaizde
- Mobilieji darbuotojai, sąrašo ekrane paspaudę „Pradėti darbą“ (start work), po sėkmingo būsenos atnaujinimo yra automatiškai nukreipiami tiesiai į to objekto detalių puslapį (`/m/site/${site.id}`), pagerinant UX ir panaikinant poreikį ieškoti papildomo mygtuko „Tęsti darbą“.

### ✨ Premium "Beta" meniu elementai
- **Failas:** [AdminLayout.tsx](file:///C:/Users/Aurimas/OneDrive%20-%20Reenpro%20UAB/Dokumentai/GitHub/Installer-app/src/components/admin/AdminLayout.tsx).
- **Sprendimas:**
  - Neaktyvūs meniu punktai („Montuotojai“, „Bonusai“, „Ataskaitos“, „Importas“) turi iššokantį „Beta“ ženkliuką, reaguojantį į pelės užvedimą (`whileHover={{ scale: 1.1, rotate: 2 }}`).
  - Paspaudus neaktyvų punktą, iškviečiamas `useConfirm` modalas, siūlantis el. pašto prenumeratą pranešimams apie naują modulį gauti.

---

## 3. Rytojaus planas: „Montuotojų valdymas“

Rytoj pradedame kurti visiškai naują administravimo modulį, kuris pakeis dabartinį neaktyvų „Montuotojai“ (Beta) punktą į visiškai funkcionuojantį valdiklį:
- **Montuotojų profiliai:** darbuotojų sąrašas, paieška, filtravimas pagal būseną (aktyvus / neaktyvus).
- **Statistika:** atliktų objektų kiekis, sugeneruoti laiko įrašai, efektyvumo rodikliai.
- **Valdymas:** naujo montuotojo pakvietimas/sukūrimas, redagavimas ir teisių valdymas.
