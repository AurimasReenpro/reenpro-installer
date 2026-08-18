/**
 * Medžiagų žiniaraščio būsenų eiga.
 *
 * Sprendimas ir priežastys — `supabase/MEDZIAGU-EIGA.md`. Čia tik tai, ko
 * reikia sąsajai: kaip būsena vadinasi, kas toliau, kurie kiekių stulpeliai
 * prasmingi ir ar žiniaraštį dar galima keisti.
 *
 * Perėjimų šis failas NEDARO. Jiems reikia `site_material_events` lentelės ir
 * `SECURITY DEFINER` procedūros, kuri tikrintų leidžiamą kryptį ir teisę;
 * paprastas `update` iš naršyklės paliktų eigą be pėdsakų.
 */

export const MATERIAL_STATUSES = [
  'rengiamas',
  'pateiktas',
  'truksta',
  'patvirtintas',
  'isduota',
  'faktas_suvestas',
  'grazinta_taisyti',
  'priimta',
  'nurasyta',
] as const;

export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export const STATUS_LABELS: Record<MaterialStatus, string> = {
  rengiamas:        'Rengiamas',
  pateiktas:        'Pateiktas tiekimui',
  truksta:          'Trūksta medžiagų',
  patvirtintas:     'Patvirtintas',
  isduota:          'Išduota',
  faktas_suvestas:  'Faktas suvestas',
  grazinta_taisyti: 'Grąžinta taisyti',
  priimta:          'Priimta',
  nurasyta:         'Nurašyta',
};

/** Kas turi veikti toliau — kad ekrane matytųsi ne tik būsena, bet ir laukimas. */
export const STATUS_HINTS: Record<MaterialStatus, string> = {
  rengiamas:        'Pildomas. Pateikus tiekimui eilutės užsirakins.',
  pateiktas:        'Laukiama tiekimo patvirtinimo, ar medžiagų turime.',
  truksta:          'Tiekimas nurodė, kad ne visko turime.',
  patvirtintas:     'Medžiagų turime — montavimą galima planuoti.',
  isduota:          'Medžiagos išduotos. Laukiama montuotojų fakto.',
  faktas_suvestas:  'Montuotojai suvedė faktą. Laukiama darbų vadovo.',
  grazinta_taisyti: 'Darbų vadovas grąžino taisyti — eilutes vėl galima keisti.',
  priimta:          'Darbų vadovas priėmė. Lieka perduoti buhalterijai.',
  nurasyta:         'Perduota buhalterijai nurašymui.',
};

/**
 * Pagrindinė eiga žingsniams rodyti.
 *
 * `truksta` ir `grazinta_taisyti` čia sąmoningai NEĮTRAUKTI: tai ne žingsniai
 * pirmyn, o grįžimai. Įdėjus juos į eilę, „3 iš 9" meluotų apie pažangą.
 */
export const MAIN_FLOW: readonly MaterialStatus[] = [
  'rengiamas', 'pateiktas', 'patvirtintas', 'isduota',
  'faktas_suvestas', 'priimta', 'nurasyta',
];

/** Žingsnio numeris pagrindinėje eigoje, arba `null` šalutinėms būsenoms. */
export function flowPosition(status: MaterialStatus): { step: number; total: number } | null {
  const i = MAIN_FLOW.indexOf(status);
  if (i < 0) return null;
  return { step: i + 1, total: MAIN_FLOW.length };
}

/**
 * Ar suplanuotus kiekius dar galima keisti.
 *
 * Pateikus tiekimui žiniaraštis užrakinamas — kitaip tiekimas patvirtintų
 * vieną sąrašą, o montuotojas gautų kitą. Atrakina tik grąžinimas taisyti.
 */
export function isPlannedEditable(status: MaterialStatus): boolean {
  return status === 'rengiamas' || status === 'grazinta_taisyti';
}

/** Išduoti kiekiai prasmingi tik nuo patvirtinimo. */
export function showsIssued(status: MaterialStatus): boolean {
  return ['patvirtintas', 'isduota', 'faktas_suvestas', 'priimta', 'nurasyta'].includes(status);
}

/** Faktas atsiranda tik jį suvedus. */
export function showsActual(status: MaterialStatus): boolean {
  return ['faktas_suvestas', 'priimta', 'nurasyta'].includes(status);
}

export type StatusTone = 'neutral' | 'info' | 'warning' | 'success';

export function statusTone(status: MaterialStatus): StatusTone {
  switch (status) {
    case 'rengiamas':        return 'neutral';
    case 'pateiktas':
    case 'isduota':
    case 'faktas_suvestas':  return 'info';
    case 'truksta':
    case 'grazinta_taisyti': return 'warning';
    case 'patvirtintas':
    case 'priimta':
    case 'nurasyta':         return 'success';
  }
}

/** Nežinoma reikšmė, jei kurio nors kiekio dar nėra — `null` nėra nulis. */
export type QtyComparison = 'nezinoma' | 'sutampa' | 'daugiau' | 'maziau';

/**
 * Fakto ir plano palyginimas.
 *
 * `qty_planned = null` reiškia „reikės, bet kiek — dar nežinome", tad su juo
 * lyginti nėra ko: toks faktas nėra nei nukrypimas, nei sutapimas.
 */
export function compareQty(
  planned: number | null,
  actual: number | null,
): QtyComparison {
  if (planned == null || actual == null) return 'nezinoma';
  if (actual === planned) return 'sutampa';
  return actual > planned ? 'daugiau' : 'maziau';
}

/** Skirtumas rodymui, arba `null`, kai lyginti nėra su kuo. */
export function qtyDelta(planned: number | null, actual: number | null): number | null {
  if (planned == null || actual == null) return null;
  return parseFloat((actual - planned).toFixed(3));
}

/** Ar būsena reiškia, kad žiniaraštis jau užbaigtas ir nebejuda. */
export function isFinal(status: MaterialStatus): boolean {
  return status === 'nurasyta';
}

/** Bazė leidžia tik šias reikšmes; iš jos gali ateiti ir nežinoma. */
export function asMaterialStatus(value: string | null | undefined): MaterialStatus {
  return (MATERIAL_STATUSES as readonly string[]).includes(value ?? '')
    ? (value as MaterialStatus)
    : 'rengiamas';
}
