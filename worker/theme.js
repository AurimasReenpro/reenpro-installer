/**
 * REENPRO dizaino sistema v1.0 — bendri tokenai, ikonos ir puslapio karkasas.
 *
 * Taisyklė: HEX reikšmės rašomos TIK čia, `:root` bloke. Komponentuose
 * naudojami tik kintamieji.
 *
 * Šis failas yra KOPIJA, identiška reenpro-dashboard/src/theme.js.
 * Keičiant vieną, nukopijuoti į kitą — kitaip dvi programėlės pradės
 * skirtis, o žmogus tarp jų vaikšto per vieną nuorodą.
 */

export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

/**
 * Lietuviška daugiskaita.
 * 1, 21, 31 → programėlė | 2–9, 22–29 → programėlės | 0, 10–19, 20 → programėlių
 */
export function plural(n, one, few, many) {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 19) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 9) return few;
  return many;
}

/** Lucide ikonos (stroke 2, apvalūs galai). Viena biblioteka visame ekrane. */
const ICON_PATHS = {
  "file-text":
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  "hard-hat":
    '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/>',
  "battery-charging":
    '<path d="M15 7h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><path d="M6 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1"/><path d="m11 7-3 5h4l-3 5"/><path d="M22 11v2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  "layout-grid":
    '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "log-out":
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  "circle-alert":
    '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  "circle-check": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  "circle-minus": '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
  "arrow-left": '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.113 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  "trash-2":
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  "file-plus":
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  "eye-off":
    '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  "triangle-alert":
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
};

/**
 * @param {string} name  ICON_PATHS raktas
 * @param {number} size  px
 */
export function icon(name, size = 20) {
  const paths = ICON_PATHS[name] || ICON_PATHS["layout-grid"];
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const STYLES = `
:root {
  --brand-primary:#1d033a; --brand-secondary:#E94E34;
  --brand-secondary-hover:#D4402A; --brand-secondary-text:#C43C22;
  --bg-page:#F7F7FA; --bg-surface:#FFFFFF; --bg-subtle:#F2F3F7; --bg-hover:#F0EEF5;
  --text-primary:#1d033a; --text-secondary:#4A4458; --text-muted:#6E6880;
  --text-disabled:#A9A3B8; --text-on-brand:#FFFFFF;
  --border-subtle:#EBE9F0; --border-default:#DDD9E5; --border-strong:#BFB8CC;
  --radius-sm:6px; --radius-md:8px; --radius-lg:10px; --radius-pill:999px;
  --shadow-xs:0 1px 2px rgba(29,3,58,.05);
  --shadow-sm:0 1px 3px rgba(29,3,58,.07), 0 1px 2px rgba(29,3,58,.04);
  --duration-fast:140ms; --ease-out:cubic-bezier(.16,1,.3,1);
  --font-sans:'Space Grotesk','Segoe UI',system-ui,-apple-system,sans-serif;
}

*,*::before,*::after { box-sizing:border-box; }
html { -webkit-text-size-adjust:100%; }
body {
  margin:0; min-height:100vh; background:var(--bg-page); color:var(--text-secondary);
  font-family:var(--font-sans); font-size:14px; line-height:1.5;
  font-variant-numeric:tabular-nums; -webkit-font-smoothing:antialiased;
}
:focus-visible { outline:2px solid var(--brand-secondary); outline-offset:2px; }
.ico { flex:none; }

/* --- Topbar 56px --- */
.topbar {
  height:56px; background:var(--bg-surface);
  border-bottom:1px solid var(--border-subtle);
  display:flex; align-items:center; gap:12px; padding:0 32px;
}
/* Logotipas neša prekės ženklą — todėl šalia jo ember brūkšnio nėra.
   Aukštis 26px → 136px plotis (738x141 proporcija). */
.logo { display:block; height:26px; width:auto; }
.topbar-spacer { margin-left:auto; }
.topbar-link {
  display:inline-flex; align-items:center; gap:8px; min-height:32px; padding:0 10px;
  border-radius:var(--radius-md); color:var(--text-secondary);
  font:500 13px/1 var(--font-sans); text-decoration:none;
  transition:background-color var(--duration-fast) var(--ease-out),
             color var(--duration-fast) var(--ease-out);
}
.topbar-link:hover { background:var(--bg-hover); color:var(--text-primary); }
.topbar-link[aria-current="page"] { background:var(--bg-hover); color:var(--text-primary); }
.identity { font-size:13px; color:var(--text-muted); max-width:32ch;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.signout {
  display:inline-flex; align-items:center; gap:8px; min-height:32px; padding:0 10px;
  border:0; border-radius:var(--radius-md); background:transparent;
  color:var(--text-secondary); font:500 13px/1 var(--font-sans);
  text-decoration:none; cursor:pointer;
  transition:background-color var(--duration-fast) var(--ease-out),
             color var(--duration-fast) var(--ease-out);
}
.signout:hover { background:var(--bg-hover); color:var(--text-primary); }

/* --- Puslapio antraštė --- */
.pagehead {
  background:var(--bg-surface); border-bottom:1px solid var(--border-subtle);
  padding:24px 32px;
}
.eyebrow {
  display:flex; align-items:center; gap:10px; margin:0 0 10px;
  font-size:11px; font-weight:500; line-height:1.2; letter-spacing:.14em;
  text-transform:uppercase; color:var(--text-muted);
}
.eyebrow::before { content:""; width:34px; height:4px; border-radius:2px;
  background:var(--brand-secondary); }
.pagehead h1 { margin:0; font-size:24px; font-weight:500; line-height:1.25;
  letter-spacing:-.01em; color:var(--text-primary); }
.context { margin:6px 0 0; font-size:13px; color:var(--text-muted); }

/* --- Turinys --- */
.content { padding:24px 32px 48px; max-width:1600px; }
.grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); }

/* --- Programėlės kortelė --- */
.tile {
  position:relative; display:block; padding:20px 20px 20px 24px;
  background:var(--bg-surface); border:1px solid var(--border-subtle);
  border-radius:var(--radius-lg); box-shadow:var(--shadow-xs);
  color:inherit; text-decoration:none;
  transition:border-color var(--duration-fast) var(--ease-out),
             background-color var(--duration-fast) var(--ease-out),
             box-shadow var(--duration-fast) var(--ease-out);
}
/* Ember strypelis = prieiga suteikta. Ne dekoracija — būsenos nešėjas. */
.tile::before {
  content:""; position:absolute; left:0; top:16px; bottom:16px; width:3px;
  border-radius:0 2px 2px 0; background:var(--brand-secondary);
}
.tile:not(.pending):hover { border-color:var(--border-strong); box-shadow:var(--shadow-sm); }
/* Pavadinimo nuoroda išsitempia per visą kortelę – taip kortelė lieka
   spustelima ištisai, nors viduje yra ir atskiras mygtukas. */
.tile-link { color:inherit; text-decoration:none; }
.tile-link::after { content:""; position:absolute; inset:0; border-radius:inherit; }
.tile-actions { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-top:16px; }
.tile-actions .tile-action { margin-top:0; }
/* Ramus, ne ember: ember šioje kortelėje jau žymi prieigą ir „Atidaryti“. */
.tile-extra {
  position:relative; z-index:1;
  display:inline-flex; align-items:center; gap:6px; min-height:32px; padding:0 12px;
  border:1px solid var(--border-default); border-radius:var(--radius-md);
  background:var(--bg-surface); color:var(--text-secondary);
  font:500 13px/1 var(--font-sans); text-decoration:none;
  transition:background-color var(--duration-fast) var(--ease-out),
             border-color var(--duration-fast) var(--ease-out),
             color var(--duration-fast) var(--ease-out);
}
.tile-extra:hover { background:var(--bg-hover); border-color:var(--border-strong); color:var(--text-primary); }
/* Ikona lieka rami — ember šiame ekrane žymi tik prieigą ir veiksmą. */
.tile-icon { color:var(--text-primary); margin-bottom:14px; }
.tile h2 { margin:0 0 6px; font-size:16px; font-weight:500; line-height:1.35;
  color:var(--text-primary); }
.tile p { margin:0; font-size:13px; line-height:1.45; color:var(--text-secondary); }
.tile-action {
  display:inline-flex; align-items:center; gap:6px; margin-top:16px;
  font-size:13px; font-weight:500; color:var(--brand-secondary-text);
}
.tile:not(.pending):hover .tile-action { color:var(--brand-secondary-hover); }

/* Ruošiama: be strypelio, prislopinta, ne nuoroda. */
.tile.pending { background:var(--bg-subtle); box-shadow:none; }
.tile.pending::before { background:var(--border-default); }
.tile.pending .tile-icon,
.tile.pending h2 { color:var(--text-muted); }
.tile.pending p { color:var(--text-muted); }
.tile-state {
  display:inline-flex; align-items:center; gap:6px; margin-top:16px;
  padding:2px 10px 2px 8px; border-radius:var(--radius-pill);
  border:1px solid var(--border-default); background:var(--bg-surface);
  font-size:12px; color:var(--text-muted);
}

/* --- Tuščia ir klaidos būsena --- */
.notice {
  background:var(--bg-surface); border:1px solid var(--border-subtle);
  border-radius:var(--radius-lg); box-shadow:var(--shadow-xs);
  padding:40px; max-width:44rem;
}
.notice-icon { color:var(--text-disabled); margin-bottom:16px; }
.notice h1, .notice h2 { margin:0 0 8px; font-size:19px; font-weight:500; line-height:1.3;
  color:var(--text-primary); }
.back {
  display:inline-flex; align-items:center; gap:8px; min-height:32px;
  font-size:13px; font-weight:500; color:var(--brand-secondary-text);
  text-decoration:none;
}
.back:hover { text-decoration:underline; }
.notice p { margin:0 0 12px; font-size:14px; line-height:1.6;
  color:var(--text-secondary); max-width:52ch; }
.notice p:last-child { margin-bottom:0; }
/* :not(.btn) – kitaip ši taisyklė nustelbtų mygtukų spalvą (didesnis
   specifiškumas nei .btn-primary) ir tekstas taptų nematomas. */
.notice a:not(.btn) { color:var(--brand-secondary-text); }
.detail {
  margin-top:20px; padding:12px 14px; background:var(--bg-subtle);
  border-radius:var(--radius-md); font-size:13px; color:var(--text-muted);
}
.detail b { display:block; margin-bottom:2px; font-weight:500; letter-spacing:.14em;
  text-transform:uppercase; font-size:11px; color:var(--text-muted); }

/* --- Skirtukai --- */
.tabs { display:flex; gap:4px; margin:16px 0 -1px; }
.tab {
  display:inline-flex; align-items:center; height:40px; padding:0 14px;
  border:0; border-bottom:2px solid transparent; background:transparent;
  color:var(--text-muted); font:500 13px/1 var(--font-sans);
  text-decoration:none; cursor:pointer;
  transition:color var(--duration-fast) var(--ease-out),
             border-color var(--duration-fast) var(--ease-out);
}
.tab:hover { color:var(--text-primary); }
.tab[aria-current="page"] { color:var(--text-primary); border-bottom-color:var(--brand-secondary); }

/* --- Filtrų juosta --- */
.filters {
  display:flex; flex-wrap:wrap; align-items:flex-end; gap:12px;
  margin-bottom:16px;
}
.filters .field { margin:0; min-width:180px; }
.filters .field.grow { flex:1 1 220px; }
select.input { padding-right:8px; }
.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }

/* --- Lentelė --- */
.table-wrap {
  background:var(--bg-surface); border:1px solid var(--border-subtle);
  border-radius:var(--radius-lg); box-shadow:var(--shadow-xs);
  overflow-x:auto;
}
table { width:100%; border-collapse:collapse; font-size:13px; }
thead th {
  text-align:left; padding:11px 20px; white-space:nowrap;
  font-size:13px; font-weight:500; color:var(--text-muted);
  background:var(--bg-subtle);
}
tbody td {
  height:48px; padding:0 20px; vertical-align:middle;
  border-top:1px solid var(--border-subtle); color:var(--text-secondary);
}
tbody tr:hover { background:var(--bg-hover); }
td.strong { color:var(--text-primary); font-weight:500; white-space:nowrap; }
td.muted { color:var(--text-muted); }

/* Būsena: spalva + ikona + tekstas. Spalva niekada nėra vienintelis nešėjas. */
.pill {
  display:inline-flex; align-items:center; gap:6px; white-space:nowrap;
  padding:2px 10px 2px 8px; border-radius:var(--radius-pill);
  border:1px solid; font-size:12px; font-weight:500;
}
.pill-ok    { color:#1E7A4C; background:#EAF6EF; border-color:#BEE3CD; }
.pill-off   { color:#4A4458; background:#F2F3F7; border-color:#DDD9E5; }
.pill-admin { color:#8A5300; background:#FDF4E3; border-color:#F0DCB0; }
.pill-draft { color:#8A5300; background:#FDF4E3; border-color:#F0DCB0; }

/* --- Būsenos juosta virš lentelės --- */
.statebar {
  display:flex; flex-wrap:wrap; align-items:center; gap:16px;
  padding:16px 20px; margin-bottom:16px;
  background:var(--bg-surface); border:1px solid var(--border-subtle);
  border-radius:var(--radius-lg); box-shadow:var(--shadow-xs);
}
.statebar-main { display:grid; gap:4px; min-width:0; }
.statebar h2 { margin:0; display:flex; flex-wrap:wrap; align-items:center; gap:10px;
  font-size:16px; font-weight:500; color:var(--text-primary); }
.statebar .hint { max-width:64ch; }
.statebar-actions { display:flex; flex-wrap:wrap; gap:8px; margin-left:auto; }
.btn[disabled] { opacity:.55; cursor:default; }
tbody tr[data-item] { cursor:pointer; }

/* Maržos skydelyje – po dvi eilėje, kad tilptų be slinkimo. */
.pairs { display:grid; grid-template-columns:1fr 1fr; gap:12px 16px; margin-bottom:20px; }
.pairs .field { margin-bottom:0; }
.derived { font-size:12px; color:var(--text-muted); font-variant-numeric:tabular-nums; }
/* Kainos lygis: kaina viršuje, marža po ja — matyti ir rezultatas, ir iš ko jis gautas. */
.lvl { display:inline-grid; gap:1px; justify-items:end; }
.lvl b { font-weight:500; color:var(--text-primary); }
.lvl span { font-size:12px; color:var(--text-muted); }

/* Excel mygtukai filtrų juostos gale – ne prie versijos veiksmų, nes
   nekeičia versijos būsenos. */
.filters-end { display:flex; flex-wrap:wrap; gap:8px; margin-left:auto; }
/* Versijos pavadinimas su pieštuku: redagavimo laukas pakeičia patį
   pavadinimą, todėl vieta ta pati ir eilutė nešokinėja. */
.version-name { display:inline-flex; align-items:center; gap:6px; }
.version-name .input { min-width:22ch; }
.drawer-wide { width:640px; }
@media (max-width:520px) { .pairs { grid-template-columns:1fr; } }

.chips { display:flex; flex-wrap:wrap; gap:4px; }
.chip {
  padding:2px 8px; border-radius:var(--radius-sm);
  border:1px solid var(--border-default); background:var(--bg-subtle);
  font-size:12px; color:var(--text-secondary); white-space:nowrap;
}

/* --- Skydelis iš dešinės --- */
.backdrop {
  position:fixed; inset:0; z-index:10; background:rgba(29,3,58,.4);
  opacity:0; pointer-events:none;
  transition:opacity var(--duration-base) var(--ease-out);
}
.backdrop.open { opacity:1; pointer-events:auto; }
.drawer {
  position:fixed; top:0; right:0; bottom:0; z-index:11;
  width:400px; max-width:100vw; display:flex; flex-direction:column;
  background:var(--bg-surface); box-shadow:0 12px 32px rgba(29,3,58,.12);
  border-radius:14px 0 0 14px; transform:translateX(100%);
  transition:transform var(--duration-slow) var(--ease-out);
}
.drawer.open { transform:translateX(0); }
.drawer-head {
  display:flex; align-items:center; gap:12px; padding:20px 24px;
  border-bottom:1px solid var(--border-subtle);
}
.drawer-head h2 { margin:0; font-size:19px; font-weight:500; color:var(--text-primary); }
.drawer-body { flex:1; overflow-y:auto; padding:24px; }
.drawer-foot {
  display:flex; gap:8px; padding:16px 24px;
  border-top:1px solid var(--border-subtle);
}
.icon-btn {
  margin-left:auto; display:grid; place-items:center; width:32px; height:32px;
  border:0; border-radius:var(--radius-md); background:transparent;
  color:var(--text-muted); cursor:pointer;
  transition:background-color var(--duration-fast) var(--ease-out);
}
.icon-btn:hover { background:var(--bg-hover); color:var(--text-primary); }

/* --- Formos --- */
.field { display:grid; gap:6px; margin-bottom:20px; }
.field > label { font-size:13px; font-weight:500; color:var(--text-primary); }
.input {
  height:36px; padding:0 12px; border:1px solid var(--border-default);
  border-radius:var(--radius-md); background:var(--bg-surface);
  font:400 13px/1 var(--font-sans); color:var(--text-primary);
}
.input:hover { border-color:var(--border-strong); }
.input:focus {
  outline:none; border-color:var(--brand-secondary);
  box-shadow:0 0 0 3px rgba(233,78,52,.28);
}
.input[readonly] { background:var(--bg-subtle); color:var(--text-secondary); }
.hint { margin:0; font-size:12px; line-height:1.45; color:var(--text-muted); }
.check {
  display:flex; align-items:center; gap:10px; min-height:32px;
  font-size:13px; color:var(--text-secondary); cursor:pointer;
}
.check input { width:16px; height:16px; accent-color:var(--brand-secondary); cursor:pointer; }
.check input:disabled { cursor:not-allowed; }
.check.off { color:var(--text-disabled); cursor:not-allowed; }
.divider { height:1px; margin:24px 0; background:var(--border-subtle); }
.form-error {
  display:none; margin-bottom:16px; padding:10px 12px;
  border:1px solid #F3C9C4; border-radius:var(--radius-md);
  background:#FCEBE9; color:#C0281C; font-size:13px; line-height:1.5;
}
.form-error.show { display:block; }

tbody tr[data-user] { cursor:pointer; }

@media (max-width:768px) { .drawer { border-radius:0; } }

/* --- Mygtukai --- */
.btn {
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  min-height:36px; padding:0 16px; border:0; border-radius:var(--radius-md);
  font:500 14px/1 var(--font-sans); text-decoration:none; cursor:pointer;
  transition:background-color var(--duration-fast) var(--ease-out),
             color var(--duration-fast) var(--ease-out);
}
/* Fonas #C43C22, ne #E94E34 — su baltu tekstu duoda 5,23:1 (AA). */
.btn-primary { background:var(--brand-secondary-text); color:var(--text-on-brand); }
.btn-primary:hover { background:#A32F19; }
.btn-quiet { background:transparent; color:var(--text-secondary); }
.btn-quiet:hover { background:var(--bg-hover); color:var(--text-primary); }
/* Trynimas: atskirtas nuo išsaugojimo, kad pelė jo nepakliūtų netyčia. */
.btn-danger { margin-left:auto; background:transparent; color:#C0281C; }
.btn-danger:hover { background:#FCEBE9; }
.btn-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:24px; }

.center { min-height:100vh; display:grid; place-items:center; padding:32px; }
.center-stack { display:flex; flex-direction:column; align-items:flex-start; gap:24px; }
.logo-lg { display:block; height:30px; width:auto; }

@media (max-width:768px) {
  .topbar { padding:0 16px; gap:8px; }
  /* Kas prisijungęs – svarbiau nei žodis „Atsijungti“, todėl slepiame žymą,
     o mygtukas tampa 44x44 px touch taikiniu su aria-label. */
  .signout-label { position:absolute; width:1px; height:1px; overflow:hidden;
    clip:rect(0 0 0 0); white-space:nowrap; }
  .signout { min-width:44px; min-height:44px; justify-content:center; padding:0; }
  .identity { max-width:20ch; }
  .pagehead, .content { padding-left:16px; padding-right:16px; }
  .notice { padding:24px; }
}
@media (prefers-reduced-motion:reduce) {
  *,*::before,*::after {
    animation-duration:.01ms !important; animation-iteration-count:1 !important;
    transition-duration:.01ms !important;
  }
}
`;

/** Sudeda pilną HTML puslapį. */
export function page({ title, body }) {
  return `<!doctype html>
<html lang="lt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500&display=swap">
<style>${STYLES}</style>
</head>
<body>${body}</body>
</html>`;
}
