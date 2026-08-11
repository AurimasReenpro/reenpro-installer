# Graph Report - .  (2026-07-09)

## Corpus Check
- 328 files · ~228,333 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1489 nodes · 3202 edges · 93 communities (75 shown, 18 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 156 edges (avg confidence: 0.82)
- Token cost: 460,000 input · 32,000 output

## Community Hubs (Navigation)
- B2B Site Setup & Legacy Payroll
- B2B Work Categories API
- Mobile Hooks & Confirm Modal
- Template Phases & Time Entry Admin
- Admin Sites List
- Reports & Analytics API
- Installer KPI List Model
- Package Dependencies
- Payroll Earnings & Basket
- Payroll Rules & Formatting
- Mockup App Dependencies
- App Routing & Lazy Pages
- TypeScript App Config
- Payroll Periods API
- Project Docs & Session State
- Equipment Catalog
- Installer & Team Management
- Sites API Core
- Schedule Board Drag-Drop
- Schedule Capacity Model
- Admin Dashboard UI
- Installers Admin Page
- Checklist Phase Grouping
- Schedule Warnings & Equipment
- Design Taste Skills
- Dev Dependencies
- Image Annotation Canvas
- Payroll Rule Overrides
- Photo Annotator Components
- Postgres Indexing Practices
- Site Details Header & Stringing
- Payroll Rate Cards
- Job Completion Validation
- Lightbox & PDF Preview
- Site Files & Blueprints
- TypeScript Node Config
- Mockup tsconfig
- Admin Layout & Theming
- Edit Installer Modal
- Site Status Library
- Dashboard Data API
- Time Tracking & Geolocation
- Site Map Component
- Login & Mobile Stats
- Checklist Photos & Helpers
- Mobile Site Card
- Photo Upload Hook
- Postgres Practice Docs
- Package Scripts
- Company Settings
- Brandkit & Imagegen Skills
- Social Icon Sprite
- PWA Icon Generator
- Working Today Panel
- Error Boundary & Sentry
- Confirm Context Provider
- Audit Log Tab
- PWA Icon 192 Branding
- Maskable PWA Icon
- Dashboard Load Errors
- Add Installer Modal
- Tech Data Modal
- Hero Image Concepts
- Mobile Layout & Network
- Apple Touch Icon
- Favicon Brand Mark
- Vite Logo Asset
- OSRM Route Distance
- PWA Icon 512
- Installer Work Roles
- React Logo Asset
- Batching & Lock Practices
- Upsert & Queue Locking
- Mockup App Shell
- Live Admin Timer
- Create Installer Edge Function
- TypeScript Root Config
- Supabase Skill Feedback
- Data Types & Primary Keys
- Find Skills Skill
- Site Card Design Concept
- Mockup Index Docs
- Lowercase Identifiers Practice
- Cowork Project Instructions
- Admin Bonuses Mockup
- Admin Checklists Mockup
- Admin Sites List Mockup
- Mobile Photos Mockup
- Karpathy Guidelines Skill

## God Nodes (most connected - your core abstractions)
1. `supabase` - 38 edges
2. `Installers()` - 32 edges
3. `compilerOptions` - 26 edges
4. `payrollErrorMessage()` - 19 edges
5. `useConfirm()` - 19 edges
6. `SiteType` - 17 edges
7. `IkainiaiTab()` - 17 edges
8. `useAuthStore` - 17 edges
9. `compilerOptions` - 16 edges
10. `compilerOptions` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Objekto Kortelė (Site Card) Design Concept` --semantically_similar_to--> `Admin Site Detail Screen Mockup`  [INFERRED] [semantically similar]
  html/objekto_kortele_ideja.html → referance/admin-site-detail.html
- `Mobile Site Detail (Objektas) Screen Mockup` --conceptually_related_to--> `Silent Time Tracking (Installer UI)`  [INFERRED]
  referance/mobile-site-detail.html → SYSTEM_CONTEXT.md
- `Mobile My Time (Mano laikas) Screen Mockup` --conceptually_related_to--> `Silent Time Tracking (Installer UI)`  [INFERRED]
  referance/mobile-time.html → SYSTEM_CONTEXT.md
- `Installers()` --indirect_call--> `installer()`  [INFERRED]
  src/pages/admin/Installers.tsx → src/pages/admin/installers/installerListModel.test.ts
- `GPT Taste (Awwwards GSAP Design Engineering Skill)` --semantically_similar_to--> `Design Taste Frontend v2 (Anti-Slop Frontend Skill)`  [INFERRED] [semantically similar]
  .agents/skills/gpt-taste/SKILL.md → .agents/skills/design-taste-frontend/SKILL.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Connection Management Rule Category (conn- prefix)** — agents_skills_supabase_postgres_best_practices_references_conn_idle_timeout, agents_skills_supabase_postgres_best_practices_references_conn_limits, agents_skills_supabase_postgres_best_practices_references_conn_pooling, agents_skills_supabase_postgres_best_practices_references_conn_prepared_statements, agents_skills_supabase_postgres_best_practices_references__sections [EXTRACTED 1.00]
- **Shared Inter-Font Ban Across Design Skills** — agents_skills_design_taste_frontend_v1_skill, agents_skills_design_taste_frontend_skill, agents_skills_gpt_taste_skill, agents_skills_high_end_visual_design_skill, agents_skills_minimalist_ui_skill, agents_skills_stitch_design_taste_skill, agents_skills_stitch_design_taste_design [INFERRED 0.85]
- **Anti-Generic Frontend Design Skill Family** — agents_skills_design_taste_frontend_v1_skill, agents_skills_design_taste_frontend_skill, agents_skills_gpt_taste_skill, agents_skills_high_end_visual_design_skill, agents_skills_redesign_existing_projects_skill, agents_skills_stitch_design_taste_skill [INFERRED 0.85]
- **Postgres Indexing Strategy** — _agents_skills_supabase_postgres_best_practices_references_query_missing_indexes_where_join_indexes, _agents_skills_supabase_postgres_best_practices_references_query_composite_indexes_composite_indexes, _agents_skills_supabase_postgres_best_practices_references_query_covering_indexes_covering_indexes, _agents_skills_supabase_postgres_best_practices_references_query_partial_indexes_partial_indexes, _agents_skills_supabase_postgres_best_practices_references_query_index_types_index_type_selection, _agents_skills_supabase_postgres_best_practices_references_schema_foreign_key_indexes_fk_indexes [INFERRED 0.85]
- **Lock Contention and Concurrency Management** — _agents_skills_supabase_postgres_best_practices_references_lock_advisory_advisory_locks, _agents_skills_supabase_postgres_best_practices_references_lock_deadlock_prevention_consistent_lock_ordering, _agents_skills_supabase_postgres_best_practices_references_lock_short_transactions_short_transactions, _agents_skills_supabase_postgres_best_practices_references_lock_skip_locked_skip_locked_queue [INFERRED 0.85]
- **Query Performance Monitoring Workflow** — _agents_skills_supabase_postgres_best_practices_references_monitor_pg_stat_statements_pg_stat_statements, _agents_skills_supabase_postgres_best_practices_references_monitor_explain_analyze_explain_analyze, _agents_skills_supabase_postgres_best_practices_references_monitor_vacuum_analyze_vacuum_analyze [INFERRED 0.85]
- **InstallerApp UI Mockup Set (referance/)** — referance_index_mockup_index, referance_admin_bonuses_mockup, referance_admin_checklists_mockup, referance_admin_dashboard_mockup, referance_admin_site_detail_mockup, referance_admin_sites_list_mockup, referance_mobile_checklist_mockup, referance_mobile_photos_mockup, referance_mobile_site_detail_mockup, referance_mobile_time_mockup, referance_mobile_today_mockup [INFERRED 0.95]
- **Time Entries Tracking Flow** — current_state_strict_time_tracking_logic, system_context_silent_time_tracking, system_context_live_admin_timer, test_rls_checks_rls_test_plan [INFERRED 0.85]

## Communities (93 total, 18 thin omitted)

### Community 0 - "B2B Site Setup & Legacy Payroll"
Cohesion: 0.05
Nodes (70): ApplyB2BWorkSelectionResult, applyB2BWorkSelectionToSite(), getActiveB2BWorkCategories(), getB2BChecklistTemplateTasksByCategory(), getSiteCompensation(), SiteCompensation, upsertSiteCompensation(), assignChecklistToSite() (+62 more)

### Community 1 - "B2B Work Categories API"
Cohesion: 0.06
Nodes (56): B2BWorkCategoryInsert, B2BWorkCategoryUpdate, createB2BWorkCategory(), deactivateB2BWorkCategory(), getB2BWorkCategories(), reorderB2BWorkCategories(), mocks, updateB2BWorkCategory() (+48 more)

### Community 2 - "Mobile Hooks & Confirm Modal"
Cohesion: 0.06
Nodes (56): ConfirmModalProps, IMPORTANT: this callback runs INSIDE GoTrue's auth lock (navigator.locks)., compress(), NewMaterial, toMsg(), useExtraWorks(), usePendingPhotos(), groupChecklistItemsByWorkPhase() (+48 more)

### Community 3 - "Template Phases & Time Entry Admin"
Cohesion: 0.06
Nodes (37): ChecklistTemplatePhaseUpdate, deactivateChecklistTemplateWorkPhase(), updateChecklistTemplateWorkPhase(), adminCloseTimeEntry(), adminCorrectTimeEntry(), AdminTimeEntry, getSiteTimeEntries(), markTimeEntryReviewed() (+29 more)

### Community 4 - "Admin Sites List"
Cohesion: 0.09
Nodes (38): getActiveInstallers(), Team, archiveSite(), assignSiteTeam(), deleteSiteSafe(), getSitesList(), RawSiteListItem, setSiteStatus() (+30 more)

### Community 5 - "Reports & Analytics API"
Cohesion: 0.09
Nodes (32): getTeams(), getLaborAnalyticsReport(), getReportInstallers(), localMonthBounds(), ReportInstaller, SiteChecklistPhaseStatusRollup, SiteWorkPhaseTimeRollup, AdminEmptyState() (+24 more)

### Community 6 - "Installer KPI List Model"
Cohesion: 0.10
Nodes (35): getInstallerWorkRoleCountLabel(), asDate(), buildInstallerRows(), buildTeamCards(), closedDurationMinutes(), computeInstallerKpis(), computeInstallerWarnings(), countPlannedSitesForTeam() (+27 more)

### Community 7 - "Package Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, browser-image-compression, clsx, date-fns, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, framer-motion (+26 more)

### Community 8 - "Payroll Earnings & Basket"
Cohesion: 0.13
Nodes (23): addManualPayrollEntry(), EarningsEntry, ManualEntryType, payrollErrorMessage(), PayrollInstaller, PayrollSiteSnapshot, PeriodStatus, reverseManualPayrollEntry() (+15 more)

### Community 9 - "Payroll Rules & Formatting"
Cohesion: 0.11
Nodes (26): createPayrollRateRule(), RuleType, ruleBreakdown, AUTO_RULE_TYPES, BreakdownChip, BreakdownLine, chipFor(), COMPONENT_LABELS (+18 more)

### Community 10 - "Mockup App Dependencies"
Cohesion: 0.07
Nodes (29): dependencies, dotenv, express, @google/genai, lucide-react, motion, react, react-dom (+21 more)

### Community 11 - "App Routing & Lazy Pages"
Cohesion: 0.09
Nodes (23): AdminLayout, AdminSettings, Checklists, Dashboard, EquipmentCatalog, Installers, MobileLayout, MobileSites (+15 more)

### Community 12 - "TypeScript App Config"
Cohesion: 0.07
Nodes (28): compilerOptions, allowImportingTsExtensions, alwaysStrict, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+20 more)

### Community 13 - "Payroll Periods API"
Cohesion: 0.13
Nodes (24): BreakdownRule, EarningsEntryType, getLockedRateCardIds(), getPayrollEarnings(), getPayrollInstallers(), getPayrollPeriod(), getPayrollRateCards(), getPayrollSiteSnapshots() (+16 more)

### Community 14 - "Project Docs & Session State"
Cohesion: 0.09
Nodes (26): Installer Management Module Plan, Standardized lucide-react Icon System, Mobile Auto-Navigation After Start Work, Current State & Session Wrap-up (2026-05-19), Strict Time Tracking Logic (timeTracking.ts), Zustand useSyncStore Logout Guard, Global Promise-based useConfirm System, Installer App HTML Shell & Theme Pre-paint Script (+18 more)

### Community 15 - "Equipment Catalog"
Cohesion: 0.15
Nodes (22): createCatalogItem(), createEquipmentCategory(), deleteCatalogItem(), deleteEquipmentCategory(), getCatalogItems(), getEquipmentCategories(), updateEquipmentCategory(), CatColorForm (+14 more)

### Community 16 - "Installer & Team Management"
Cohesion: 0.12
Nodes (21): AdminInstaller, archiveTeam(), assignInstallerToTeam(), CreateInstallerData, createTeam(), deactivateInstaller(), getAdminInstallers(), getInstallerTeamPlannedSites() (+13 more)

### Community 17 - "Sites API Core"
Cohesion: 0.11
Nodes (21): Blueprint, calculateKwhFromEquipment(), calculateKwpFromEquipment(), ChecklistTemplatePhaseRow, ChecklistTemplateRow, countFor(), createSiteWorkPhasesFromTemplate(), decodeCategory() (+13 more)

### Community 18 - "Schedule Board Drag-Drop"
Cohesion: 0.14
Nodes (22): assignSiteToSchedule(), getScheduleSites(), ScheduleSite, unassignSiteFromSchedule(), cap(), dayKey(), DraggableSite(), Schedule() (+14 more)

### Community 19 - "Schedule Capacity Model"
Cohesion: 0.17
Nodes (20): DroppableCell(), batteryRows(), buildScheduleCellSummary(), buildScheduleSiteEquipmentSummary(), CAPACITY_FIELDS, fmtCompactNumber(), fmtKwp(), formatBessCapacityLabel() (+12 more)

### Community 20 - "Admin Dashboard UI"
Cohesion: 0.14
Nodes (14): DashboardAttentionItem, DashboardAttentionTone, DashboardSite, ActivityFilter, Dashboard(), formatDashboardError(), SiteMap, STATUS (+6 more)

### Community 21 - "Installers Admin Page"
Cohesion: 0.13
Nodes (17): getInstallerActivityTimeEntries(), formatDate(), formatDateTime(), getInitials(), filterTeamCards(), InstallerStatus, TeamStatusFilter, Installers() (+9 more)

### Community 22 - "Checklist Phase Grouping"
Cohesion: 0.21
Nodes (13): canCompleteChecklistItemWithPhotos(), checklistItemPhotoCount(), ChecklistPhaseGroup, ChecklistPhotoLike, ChecklistWorkCardSummary, PhotoRequirement, photosForChecklistItem(), requiredPhotoCount() (+5 more)

### Community 23 - "Schedule Warnings & Equipment"
Cohesion: 0.14
Nodes (17): buildTeamWorkRoleMap(), getScheduleWarnings(), ScheduleWarning, ScheduleWarningInstaller, ScheduleWarningSite, siteClearlyHasBess(), CatColors, DEFAULT_CAT_COLORS (+9 more)

### Community 24 - "Design Taste Skills"
Cohesion: 0.16
Nodes (21): Design Taste Frontend v2 (Anti-Slop Frontend Skill), AI Tells (Forbidden Design Patterns), Block Library Contract (pattern implementations schema), Em-Dash Ban (most-violated AI tell), LILA Rule (AI Purple/Blue Gradient Ban), Redesign Protocol (audit-first, preserve vs overhaul), Three Dials Configuration (DESIGN_VARIANCE / MOTION_INTENSITY / VISUAL_DENSITY), Viewport Stability Rule (min-h-100dvh over h-screen) (+13 more)

### Community 25 - "Dev Dependencies"
Cohesion: 0.10
Nodes (21): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom (+13 more)

### Community 26 - "Image Annotation Canvas"
Cohesion: 0.17
Nodes (19): Annotation, getFileAnnotations(), migrateAnnotation(), saveFileAnnotations(), deleteAnnotationAttachment(), AnnotatorCanvas(), AnnotatorCanvasProps, clampStageScale() (+11 more)

### Community 27 - "Payroll Rule Overrides"
Cohesion: 0.23
Nodes (17): getPayrollSiteEffectiveRateCard(), getPayrollSiteRuleState(), PayrollRateCard, PayrollSiteRuleState, RuleOverrideMode, setPayrollSiteRateCardOverride(), setPayrollSiteRuleOverride(), effectivePreview() (+9 more)

### Community 28 - "Photo Annotator Components"
Cohesion: 0.15
Nodes (14): ImageAnnotator, ImageAnnotatorLazy(), Props, PhotoAnnotator(), Props, SignedPhoto(), SignedPhotoProps, SignedUrlContext (+6 more)

### Community 29 - "Postgres Indexing Practices"
Cohesion: 0.13
Nodes (20): Cursor-Based (Keyset) Pagination Instead of OFFSET, EXPLAIN ANALYZE for Slow Query Diagnosis, pg_stat_statements Query Statistics, VACUUM and ANALYZE Statistics Maintenance, Composite Indexes for Multi-Column Queries, Covering Indexes and Index-Only Scans, Index Type Selection (B-tree, GIN, GiST, BRIN, Hash), Indexes on WHERE and JOIN Columns (+12 more)

### Community 30 - "Site Details Header & Stringing"
Cohesion: 0.17
Nodes (15): getSiteById(), updateSiteDetails(), isSiteDraft(), formatLocation(), SiteDetailsHeader(), STATUS_MAP, StringingSection(), ItemStatus (+7 more)

### Community 31 - "Payroll Rate Cards"
Cohesion: 0.22
Nodes (15): createPayrollRateCard(), currentUserId(), deactivatePayrollRateRule(), deletePayrollRateRule(), duplicatePayrollRateCard(), getPayrollRateCardRules(), getPayrollRateRuleUsage(), updatePayrollRateCard() (+7 more)

### Community 32 - "Job Completion Validation"
Cohesion: 0.14
Nodes (11): JobCompletionBlockedModalProps, useChecklistActions(), JobCompletionValidation, HeroSectionProps, STATUS, SiteDetailHeader(), SiteDetailHeaderProps, TabsBar() (+3 more)

### Community 33 - "Lightbox & PDF Preview"
Cohesion: 0.16
Nodes (15): ImageLightbox(), Props, PdfPagePreview(), PdfPagePreviewProps, docCache, loadDoc(), RenderedPdfPage, renderPdfPage() (+7 more)

### Community 34 - "Site Files & Blueprints"
Cohesion: 0.27
Nodes (16): addBlueprintCategory(), deleteSiteFile(), getBlueprintCategories(), getSiteFiles(), getSiteInstallerPhotos(), groupBlueprints(), removeBlueprintCategory(), uploadBlueprintFile() (+8 more)

### Community 35 - "TypeScript Node Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 36 - "Mockup tsconfig"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+8 more)

### Community 37 - "Admin Layout & Theming"
Cohesion: 0.23
Nodes (13): AppContent(), AdminLayout(), AdminNotification, SearchResult, useAuth(), useBranding(), applyTheme(), getStoredTheme() (+5 more)

### Community 38 - "Edit Installer Modal"
Cohesion: 0.21
Nodes (13): getActiveTeams(), updateInstaller(), EditInstallerFormValues, EditInstallerModal(), EditInstallerModalProps, editInstallerSchema, UserProfile, getInstallerWorkRoleLabel() (+5 more)

### Community 39 - "Site Status Library"
Cohesion: 0.22
Nodes (10): INSTALLER_VISIBLE_SITE_STATUSES, isArchivedSiteStatus(), isCompletedOrArchivedSiteStatus(), isInstallerVisibleSiteStatus(), isOperationalSiteStatus(), OPERATIONAL_SITE_STATUSES, fmtDate(), InfoTab() (+2 more)

### Community 40 - "Dashboard Data API"
Cohesion: 0.24
Nodes (13): asSites(), DashboardActivityItem, DashboardSupabaseError, dayWindow(), getAdminOperationsDashboard(), getMissingPdfSiteIds(), mapSite(), minutesSince() (+5 more)

### Community 41 - "Time Tracking & Geolocation"
Cohesion: 0.29
Nodes (9): getInstallerSites(), completeWork(), pauseWork(), QcFailedError, startTimeEntry(), useSiteTimeTracking(), getCurrentPositionWithTimeout(), Sites() (+1 more)

### Community 42 - "Site Map Component"
Cohesion: 0.18
Nodes (10): BaseCoords, createBaseIcon(), createSvgIcon(), FALLBACK_BASE, MapSite, MarkerColor, SiteMap(), SiteMapProps (+2 more)

### Community 43 - "Login & Mobile Stats"
Cohesion: 0.21
Nodes (11): Login(), LoginFormValues, loginSchema, CompletedSite, currentMonth(), num(), Stats(), WEEKDAYS (+3 more)

### Community 44 - "Checklist Photos & Helpers"
Cohesion: 0.33
Nodes (9): InstallerPhoto, useConfirm(), ChecklistPhoto(), STATUS_ITEM, deletePhotoFromAllSources(), extractStoragePath(), forceDownload(), IMAGE_EXTS (+1 more)

### Community 45 - "Mobile Site Card"
Cohesion: 0.24
Nodes (10): InstallerSite, dateLabel(), SiteCard(), SiteCardProps, STATUS_CHIP, StatusBadge(), StatusBadgeProps, StatusTone (+2 more)

### Community 46 - "Photo Upload Hook"
Cohesion: 0.27
Nodes (10): compress(), IMPORTANT: do NOT invalidate ['site'] here — the cache was already, SitePhoto, tempId(), toMsg(), usePhotoUpload(), photo(), PhotosTab() (+2 more)

### Community 47 - "Postgres Practice Docs"
Cohesion: 0.36
Nodes (11): Postgres References Writing Guidelines, Postgres Rule Section Definitions (8 categories by prefix), Postgres Rule File Template (incorrect/correct SQL structure), Rule: Use tsvector for Full-Text Search, Rule: Index JSONB Columns with GIN, Rule: Configure Idle Connection Timeouts, Rule: Set Appropriate Connection Limits, Rule: Use Connection Pooling for All Applications (+3 more)

### Community 48 - "Package Scripts"
Cohesion: 0.18
Nodes (10): name, private, scripts, build, dev, lint, preview, test (+2 more)

### Community 49 - "Company Settings"
Cohesion: 0.29
Nodes (7): AdminOperationsDashboard, CompanySettings, getCompanySettings(), updateCompanySettings(), FormState, inputClass(), Settings()

### Community 50 - "Brandkit & Imagegen Skills"
Cohesion: 0.27
Nodes (10): Brandkit Image Generation Skill, Brand Strategy First Principle, Full-Output Enforcement Skill, Image-to-Code Skill (image-first website workflow), Image-First Workflow (generate, analyze, then implement), Imagegen Frontend Mobile (premium app screen image skill), App Design Bible Rule (multi-screen consistency lock), Imagegen Frontend Web (per-section website design references) (+2 more)

### Community 51 - "Social Icon Sprite"
Cohesion: 0.31
Nodes (10): Bluesky Icon, Discord Icon, Documentation Icon, GitHub Icon, Icon Sprite (public/icons.svg), Social and Community Links UI, Social Icon, Starter Template Leftover Asset (+2 more)

### Community 52 - "PWA Icon Generator"
Cohesion: 0.24
Nodes (9): BG, chunk(), crc32(), crcTable, __dirname, DOT, makePng(), publicDir (+1 more)

### Community 53 - "Working Today Panel"
Cohesion: 0.31
Nodes (6): formatElapsed(), initials(), minutesSince(), WorkingEntry, WorkingRow(), WorkingTodayPanelProps

### Community 54 - "Error Boundary & Sentry"
Cohesion: 0.29
Nodes (3): FallbackProps, DSN, initSentry()

### Community 55 - "Confirm Context Provider"
Cohesion: 0.36
Nodes (5): ConfirmContext, ConfirmContextType, ConfirmOptions, ConfirmProvider(), ConfirmState

### Community 56 - "Audit Log Tab"
Cohesion: 0.38
Nodes (6): AUDIT_ITEM_STATUS_LT, AUDIT_SITE_STATUS_LT, AuditEntry, AuditLogTab(), describeAudit(), readField()

### Community 57 - "PWA Icon 192 Branding"
Cohesion: 0.40
Nodes (6): Installer App Brand Identity, Lavender Circle on Dark Purple Background, Minimal Flat Design Style, Placeholder App Icon, PWA Icon 192x192, PWA Installability (Manifest Icon)

### Community 58 - "Maskable PWA Icon"
Cohesion: 0.47
Nodes (6): Dark Purple / Lavender Palette, Likely Auto-Generated Placeholder Icon, PWA Maskable Icon 512x512, Maskable Icon Safe Zone, Placeholder Circle Design, PWA App Icon (Installer App)

### Community 60 - "Add Installer Modal"
Cohesion: 0.40
Nodes (5): createInstaller(), AddInstallerFormValues, AddInstallerModal(), AddInstallerModalProps, addInstallerSchema

### Community 61 - "Tech Data Modal"
Cohesion: 0.53
Nodes (4): updateTechData(), ROOF_ANGLES, ROOF_TYPES, TechDataModal()

### Community 62 - "Hero Image Concepts"
Cohesion: 0.40
Nodes (6): Floating Layers Illustration, Hero Image, Isometric 3D Style, Landing/Hero Section Branding, Layered Platform Metaphor, Purple Accent Palette

### Community 63 - "Mobile Layout & Network"
Cohesion: 0.47
Nodes (4): MobileLayout(), NetworkStatusChip(), useOnlineStatus(), FEATURES

### Community 64 - "Apple Touch Icon"
Cohesion: 0.40
Nodes (5): Apple Touch Icon, Dark Purple Palette, Minimal Circle Design, Placeholder Branding, PWA Home Screen Icon

### Community 65 - "Favicon Brand Mark"
Cohesion: 0.50
Nodes (5): Energy / Solar Brand Identity, Favicon SVG, Installer App Browser-Tab Branding, Double Lightning Bolt Mark, Purple Blurred-Gradient Style

### Community 66 - "Vite Logo Asset"
Cohesion: 0.50
Nodes (5): Dark Mode Adaptive Styling, Lightning Bolt Motif, Vite Scaffold Template Asset, Vite Build Tool, Vite Logo

### Community 68 - "PWA Icon 512"
Cohesion: 0.50
Nodes (4): Minimal Circle Design, Installer App PWA, Placeholder App Icon, PWA Icon 512x512

### Community 69 - "Installer Work Roles"
Cohesion: 0.50
Nodes (4): InstallerOption, InstallerWorkRole, InstallerListInstaller, InstallerRow

### Community 70 - "React Logo Asset"
Cohesion: 0.67
Nodes (4): Atom Symbol (Orbiting Electrons), React Framework, React Logo, Vite React Template Scaffold Asset

### Community 71 - "Batching & Lock Practices"
Cohesion: 0.67
Nodes (3): Eliminate N+1 Queries with Batch Loading, Deadlock Prevention via Consistent Lock Ordering, Short Transactions to Reduce Lock Contention

### Community 72 - "Upsert & Queue Locking"
Cohesion: 0.67
Nodes (3): Atomic UPSERT with INSERT ON CONFLICT, Advisory Locks for Application-Level Locking, SKIP LOCKED for Non-Blocking Queue Processing

## Ambiguous Edges - Review These
- `Icon Sprite (public/icons.svg)` → `Starter Template Leftover Asset`  [AMBIGUOUS]
  public/icons.svg · relation: conceptually_related_to
- `PWA Icon 192x192` → `Installer App Brand Identity`  [AMBIGUOUS]
  public/pwa-192x192.png · relation: conceptually_related_to
- `Placeholder App Icon` → `Installer App Brand Identity`  [AMBIGUOUS]
  public/pwa-192x192.png · relation: conceptually_related_to
- `Dark Purple / Lavender Palette` → `Likely Auto-Generated Placeholder Icon`  [AMBIGUOUS]
  public/pwa-maskable-512x512.png · relation: conceptually_related_to
- `Purple Accent Palette` → `Landing/Hero Section Branding`  [AMBIGUOUS]
  src/assets/hero.png · relation: conceptually_related_to

## Knowledge Gaps
- **443 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+438 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Icon Sprite (public/icons.svg)` and `Starter Template Leftover Asset`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `PWA Icon 192x192` and `Installer App Brand Identity`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Placeholder App Icon` and `Installer App Brand Identity`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Dark Purple / Lavender Palette` and `Likely Auto-Generated Placeholder Icon`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Purple Accent Palette` and `Landing/Hero Section Branding`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `supabase` connect `B2B Site Setup & Legacy Payroll` to `B2B Work Categories API`, `Mobile Hooks & Confirm Modal`, `Template Phases & Time Entry Admin`, `Reports & Analytics API`, `Payroll Periods API`, `Equipment Catalog`, `Installer & Team Management`, `Sites API Core`, `Checklist Phase Grouping`, `Image Annotation Canvas`, `Photo Annotator Components`, `Admin Layout & Theming`, `Site Status Library`, `Dashboard Data API`, `Login & Mobile Stats`, `Checklist Photos & Helpers`, `Photo Upload Hook`, `Company Settings`, `Audit Log Tab`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `Database` connect `Template Phases & Time Entry Admin` to `B2B Site Setup & Legacy Payroll`, `B2B Work Categories API`, `Edit Installer Modal`, `Installer & Team Management`, `Sites API Core`, `Installers Admin Page`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._