import { supabase } from '../lib/supabase';

export interface Annotation {
  id: string;
  type: 'path' | 'marker' | 'arrow' | 'rect' | 'ellipse' | 'text';
  // path  → points[]
  points?: number[];
  // marker / arrow / rect / ellipse / text → x, y (image-space origin)
  x?: number;
  y?: number;
  // arrow end point (image-space)
  x2?: number;
  y2?: number;
  // rect size (image-space)
  width?: number;
  height?: number;
  // ellipse radii (image-space)
  radiusX?: number;
  radiusY?: number;
  // text content
  text?: string;
  // photo attachments (uploaded to site_files bucket) — supports multiple per pin
  attachment_urls?: string[];
  color: string;
  strokeWidth?: number;
  icon?: 'check' | 'warning';
  comment?: string;
  // 1-based page this annotation belongs to (multi-page PDFs). Defaults to 1.
  page_number?: number;

  // ── Autorystė ──────────────────────────────────────────────────────────
  // Iki 2026-08-16 žymėjimai neturėjo nei autoriaus, nei laiko: `updated_at`
  // buvo tik visai eilutei, tad nebuvo kaip pasakyti, KAS parašė pastabą ir
  // ar ji nauja nuo praėjusios peržiūros. Seni įrašai šių laukų neturi —
  // sąsaja tokiu atveju rodo „nežinoma“, o ne slepia pastabą.
  author_id?: string;
  created_at?: string;      // ISO

  // ── Biuro peržiūra ─────────────────────────────────────────────────────
  // Biuras įrodymo nekeičia, bet gali pažymėti, kad pastabą matė. Tai
  // vienintelis dalykas, kurį peržiūros režimas rašo.
  reviewed_at?: string;     // ISO
  reviewed_by?: string;
}

// Legacy rows stored a single `attachment_url`. Convert it on the fly to the
// new `attachment_urls` array so older annotations keep working.
function migrateAnnotation(ann: Annotation & { attachment_url?: string }): Annotation {
  // Annotations created before multi-page support live on page 1.
  const withPage = ann.page_number == null ? { ...ann, page_number: 1 } : ann;
  if (!withPage.attachment_url) return withPage;
  // Strip the legacy single-URL field and fold it into the array form.
  const { attachment_url, ...rest } = withPage;
  return {
    ...rest,
    attachment_urls: rest.attachment_urls && rest.attachment_urls.length > 0
      ? rest.attachment_urls
      : [attachment_url],
  };
}

export async function getFileAnnotations(siteId: string, fileName: string): Promise<Annotation[]> {
  const { data, error } = await supabase
    .from('site_file_annotations')
    .select('annotations')
    .eq('site_id', siteId)
    .eq('file_name', fileName)
    .maybeSingle();
  if (error) throw error;
  const raw = (data?.annotations as unknown as (Annotation & { attachment_url?: string })[]) ?? [];
  return raw.map(migrateAnnotation);
}

/**
 * Objekto failų vardai, kurie TURI bent vieną žymėjimą.
 *
 * Viena užklausa visam objektui, o ne po vieną kiekvienai nuotraukai —
 * kontroliniame sąraše jų gali būti dešimtys. Naudojama ženkleliui „yra
 * žymėjimų“ administracinėje kortelėje.
 */
export async function getAnnotatedFileNames(siteId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('site_file_annotations')
    .select('file_name, annotations')
    .eq('site_id', siteId);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => Array.isArray(row.annotations) && row.annotations.length > 0)
    .map((row) => row.file_name);
}

export interface SiteAnnotationNote {
  fileName: string;
  annotationId: string;
  comment: string;
  authorId?: string;
  authorName: string;
  createdAt?: string;
  reviewedAt?: string;
  /** Nuotraukos kelias turi „/“; brėžiniai ir prisegtukai – ne. Tik nuotraukas
   *  galima atidaryti peržiūrai per `PhotoAnnotator`. */
  isPhoto: boolean;
}

/**
 * Visos objekto žymėjimų PASTABOS vienu sąrašu.
 *
 * Pastabos tekstas iki šiol gulėjo tik JSON'e ir buvo pasiekiamas vien
 * atidarius konkrečią nuotrauką. Jei montuotojas parašydavo „trūksta
 * tarpiklio“, to nematė nei objekto kortelė, nei Skydelis. Čia duomenys
 * iškeliami į paviršių — nauja informacija nerenkama, tik parodoma.
 */
export async function getSiteAnnotationNotes(siteId: string): Promise<SiteAnnotationNote[]> {
  const { data, error } = await supabase
    .from('site_file_annotations')
    .select('file_name, annotations')
    .eq('site_id', siteId);
  if (error) throw error;

  const notes: Omit<SiteAnnotationNote, 'authorName'>[] = [];
  for (const row of data ?? []) {
    const raw = Array.isArray(row.annotations) ? row.annotations : [];
    for (const item of raw as unknown as Annotation[]) {
      const comment = item.comment?.trim();
      if (!comment) continue;                       // be teksto pastabos nėra
      notes.push({
        fileName: row.file_name,
        annotationId: item.id,
        comment,
        authorId: item.author_id,
        createdAt: item.created_at,
        reviewedAt: item.reviewed_at,
        isPhoto: row.file_name.includes('/'),
      });
    }
  }

  // Vardai atskira užklausa, o ne denormalizuoti JSON'e — kitaip pervadinus
  // žmogų senos pastabos rodytų seną vardą.
  const ids = [...new Set(notes.map((n) => n.authorId).filter((v): v is string => !!v))];
  const vardai = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles').select('id, full_name').in('id', ids);
    for (const p of profiles ?? []) vardai.set(p.id, p.full_name ?? 'Be vardo');
  }

  return notes
    .map((n) => ({ ...n, authorName: n.authorId ? (vardai.get(n.authorId) ?? 'Nežinomas') : 'Nežinoma' }))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/**
 * Pašalina failo žymėjimus. Kviečiama trinant patį failą.
 *
 * Iki 2026-08-16 to nedarė niekas: `deletePhotoFromAllSources` savo komentare
 * žadėjo išvalyti „all three locations“, bet vietų yra keturios — `photos`
 * eilutė, `photo_url` nuoroda, failas saugykloje ir ŠITOS eilutės. Todėl
 * kiekviena ištrinta nuotrauka palikdavo pastabą, rodančią į nebeegzistuojantį
 * failą.
 *
 * Adminas eilutę trina; montuotojas pagal `sfa_delete` to negali, tad jam
 * masyvas ištuštinamas — rezultatas sąsajai toks pat.
 */
export async function removeFileAnnotations(siteId: string, fileName: string): Promise<void> {
  const { error } = await supabase
    .from('site_file_annotations')
    .delete()
    .eq('site_id', siteId)
    .eq('file_name', fileName);
  if (!error) return;

  await supabase
    .from('site_file_annotations')
    .update({ annotations: [] })
    .eq('site_id', siteId)
    .eq('file_name', fileName);
}

export async function saveFileAnnotations(
  siteId: string,
  fileName: string,
  annotations: Annotation[],
): Promise<void> {
  const { error } = await supabase
    .from('site_file_annotations')
    .upsert(
      { site_id: siteId, file_name: fileName, annotations: annotations as unknown as import('../types/database.types').Json },
      { onConflict: 'site_id,file_name' },
    );
  if (error) throw error;
}
