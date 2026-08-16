import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Loader2, Eye, PenLine } from 'lucide-react';
import { getSiteAnnotationNotes } from '../../../api/annotations';
import { parseBlueprintCategory } from '../../../api/sites';
import PhotoAnnotator from '../../../components/shared/PhotoAnnotator';

/** Žmogui skaitomas failo pavadinimas: nuotraukai – failo vardas, brėžiniui – kategorija. */
function failoEtiketė(fileName: string): string {
  const kategorija = parseBlueprintCategory(fileName);
  if (kategorija) return `Brėžinys: ${kategorija}`;
  if (fileName.includes('/')) return fileName.split('/').pop() ?? fileName;
  return fileName;
}

/**
 * Visos montuotojo pastabos, paliktos ant objekto nuotraukų ir brėžinių.
 *
 * Tekstas jau seniai buvo saugomas, bet gyveno tik žymėjimo JSON'e — kad jį
 * perskaitytum, reikėjo atspėti, kurią nuotrauką atidaryti. Ši kortelė nieko
 * naujo nerenka, tik iškelia tai, kas jau yra.
 */
export default function SiteAnnotationNotes({ siteId }: { siteId: string }) {
  const [perziura, setPerziura] = useState<string | null>(null);

  const { data: notes, isLoading } = useQuery({
    queryKey: ['site_annotation_notes', siteId],
    queryFn: () => getSiteAnnotationNotes(siteId),
    enabled: !!siteId,
  });

  if (isLoading) {
    return (
      <div className="bg-surface rounded-card border border-border shadow-sm p-5 flex items-center gap-2">
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
        <span className="text-[13px] text-subtle">Kraunamos pastabos…</span>
      </div>
    );
  }

  const neperziuretos = (notes ?? []).filter((n) => !n.reviewedAt).length;

  return (
    <>
      {perziura && (
        <PhotoAnnotator
          siteId={siteId}
          storagePath={perziura}
          isAdmin
          readOnly
          onClose={() => setPerziura(null)}
        />
      )}

      <div className="bg-surface rounded-card border border-border shadow-sm p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-text text-[15px] flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Montuotojų pastabos
          </h3>
          {neperziuretos > 0 && (
            <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-bold text-warning">
              {neperziuretos} neperžiūrėta
            </span>
          )}
        </div>

        {!notes || notes.length === 0 ? (
          <p className="text-[13px] text-subtle italic">
            Pastabų prie nuotraukų ir brėžinių nėra.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {notes.map((n) => (
              <li
                key={`${n.fileName}-${n.annotationId}`}
                className="rounded-[10px] border border-border/60 bg-surface-2/40 px-3 py-2.5"
              >
                <p className="text-[13px] text-text leading-snug whitespace-pre-wrap">{n.comment}</p>

                <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-subtle">
                  <span className="font-semibold text-muted">{n.authorName}</span>
                  {n.createdAt && <span className="tabular-nums">{n.createdAt.slice(0, 10)}</span>}
                  <span className="truncate max-w-[45%]" title={n.fileName}>{failoEtiketė(n.fileName)}</span>

                  {n.reviewedAt ? (
                    <span className="ml-auto inline-flex items-center gap-1 text-success font-semibold">
                      <Eye size={11} /> Peržiūrėta
                    </span>
                  ) : n.isPhoto ? (
                    <button
                      onClick={() => setPerziura(n.fileName)}
                      className="ml-auto inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
                    >
                      <PenLine size={11} /> Atidaryti
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
