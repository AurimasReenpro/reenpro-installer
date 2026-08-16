import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Loader2, Eye, PenLine, FileImage, DraftingCompass, FileX } from 'lucide-react';
import { getSiteAnnotationNotes, type SiteAnnotationNote } from '../../../api/annotations';
import { parseBlueprintCategory } from '../../../api/sites';
import { useSignedPhotoUrls } from '../../../hooks/useSignedPhotoUrls';
import PhotoAnnotator from '../../../components/shared/PhotoAnnotator';

interface Grupe {
  fileName: string;
  isPhoto: boolean;
  etiketė: string;
  notes: SiteAnnotationNote[];
}

/**
 * Failo etiketė žmogui. Saugyklos vardas (`1783448228438_7jar4s.jpg`) nieko
 * nesako, todėl nuotraukoms jo nerodome iš viso — jas atpažįsta miniatiūra.
 */
function etiketė(fileName: string): string {
  const kategorija = parseBlueprintCategory(fileName);
  if (kategorija) return `Brėžinys: ${kategorija}`;
  if (fileName.includes('/')) return 'Nuotrauka';
  if (fileName.startsWith('ann_')) return 'Pastabos priedas';
  return fileName;
}

/**
 * Visos montuotojo pastabos, paliktos ant objekto nuotraukų ir brėžinių.
 *
 * Tekstas jau seniai buvo saugomas, bet gyveno tik žymėjimo JSON'e — kad jį
 * perskaitytum, reikėjo atspėti, kurią nuotrauką atidaryti.
 *
 * Grupuojama pagal failą: prie vieno kadro dažnai būna kelios pastabos
 * („Grid port“, „Backup port“…), ir sąraše jos turi stovėti kartu, o ne
 * kartoti tą patį vardą tris kartus.
 */
export default function SiteAnnotationNotes({ siteId }: { siteId: string }) {
  const [perziura, setPerziura] = useState<string | null>(null);

  const { data: notes, isLoading } = useQuery({
    queryKey: ['site_annotation_notes', siteId],
    queryFn: () => getSiteAnnotationNotes(siteId),
    enabled: !!siteId,
  });

  const grupes = useMemo<Grupe[]>(() => {
    const map = new Map<string, Grupe>();
    for (const n of notes ?? []) {
      let g = map.get(n.fileName);
      if (!g) {
        g = { fileName: n.fileName, isPhoto: n.isPhoto, etiketė: etiketė(n.fileName), notes: [] };
        map.set(n.fileName, g);
      }
      g.notes.push(n);
    }
    return [...map.values()];
  }, [notes]);

  // Miniatiūros vienai partijai — nuotrauką atpažinti iš vaizdo greičiau nei
  // iš bet kokio vardo.
  const photoPaths = useMemo(
    () => grupes.filter((g) => g.isPhoto).map((g) => g.fileName),
    [grupes],
  );
  const { data: signedMap, isLoading: signing } = useSignedPhotoUrls(photoPaths);

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

        {grupes.length === 0 ? (
          <p className="text-[13px] text-subtle italic">
            Pastabų prie nuotraukų ir brėžinių nėra.
          </p>
        ) : (
          /* Aukštis ribojamas: pastabų gali būti daug, o kortelė neturi
             nustumti viso skirtuko žemyn. */
          <ul className="space-y-3 max-h-[420px] overflow-y-auto -mr-1 pr-1">
            {grupes.map((g) => {
              const url = g.isPhoto ? signedMap?.get(g.fileName) : undefined;
              // Supabase į atsakymą neįtraukia kelių, kurių saugykloje nėra.
              // Tad jei pasirašymas baigtas, o nuorodos nėra — failas ištrintas,
              // o pastaba liko. Geriau tai pasakyti, nei rodyti mygtuką, kuris
              // nieko neatidaro.
              const dingesFailas = g.isPhoto && !signing && !url;
              return (
                <li key={g.fileName} className="rounded-[10px] border border-border/60 overflow-hidden">
                  {/* Grupės antraštė — miniatiūra arba ikona + etiketė */}
                  <div className="flex items-center gap-2.5 bg-surface-2/60 px-3 py-2">
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        className="w-9 h-9 rounded-[6px] object-cover shrink-0 border border-border/50"
                      />
                    ) : (
                      <span className="w-9 h-9 rounded-[6px] bg-surface-2 flex items-center justify-center shrink-0 border border-border/50">
                        {g.isPhoto
                          ? <FileImage size={15} className="text-subtle" />
                          : <DraftingCompass size={15} className="text-subtle" />}
                      </span>
                    )}

                    <span className="flex-1 min-w-0 text-[12px] font-semibold text-muted truncate" title={g.fileName}>
                      {g.etiketė}
                      {g.notes.length > 1 && (
                        <span className="text-subtle font-normal"> · {g.notes.length} pastabos</span>
                      )}
                    </span>

                    {dingesFailas ? (
                      <span
                        title="Nuotrauka ištrinta, pastaba liko"
                        className="shrink-0 inline-flex items-center gap-1 rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-subtle"
                      >
                        <FileX size={11} /> Failas ištrintas
                      </span>
                    ) : g.isPhoto ? (
                      <button
                        onClick={() => setPerziura(g.fileName)}
                        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                      >
                        <PenLine size={11} /> Atidaryti
                      </button>
                    ) : null}
                  </div>

                  {/* Pastabos */}
                  <ul className="divide-y divide-border/50">
                    {g.notes.map((n) => (
                      <li key={n.annotationId} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <p className="flex-1 text-[13px] text-text leading-snug whitespace-pre-wrap">
                            {n.comment}
                          </p>
                          {n.reviewedAt && (
                            <span
                              title={`Peržiūrėta ${n.reviewedAt.slice(0, 10)}`}
                              className="shrink-0 mt-0.5 text-success"
                            >
                              <Eye size={13} />
                            </span>
                          )}
                        </div>

                        {/* Autorius ir data rodomi TIK jei žinomi. Seni įrašai jų
                            neturi, o „Nežinoma“ užimtų vietą nieko nepasakydama. */}
                        {(n.authorId || n.createdAt) && (
                          <p className="mt-0.5 text-[11px] text-subtle">
                            {n.authorId ? n.authorName : null}
                            {n.authorId && n.createdAt ? ' · ' : null}
                            {n.createdAt ? <span className="tabular-nums">{n.createdAt.slice(0, 10)}</span> : null}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
