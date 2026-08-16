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
