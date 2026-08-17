import { toast } from 'sonner';

/**
 * Pranešimas apie naują programos versiją.
 *
 * KODĖL TO REIKIA. Service worker sukonfigūruotas su `skipWaiting` ir
 * `clientsClaim`, tad naujas apvalkalas perima valdymą iš karto. Bet jau
 * įkelto puslapio JavaScript nuo to nepasikeičia — žmogus toliau mato seną
 * versiją, ir tik KITAS įkėlimas parodo naują.
 *
 * Praktinė pasekmė: pirmas apsilankymas po diegimo visada rodo seną versiją.
 * Tai kelia painiavą („ar tikrai išleidom?“) ir montuotojus gali palikti prie
 * senos programos ilgam, nes PWA jie laiko atidarytą visą dieną.
 *
 * KODĖL NE AUTOMATINIS PERKROVIMAS. Montuotojas tuo metu gali pildyti formą
 * ar rašyti pastabą prie nuotraukos. Tylus perkrovimas tai nušluotų, o duomenų
 * praradimas lauke yra brangesnis už vieną papildomą paspaudimą. Sprendimą
 * priima žmogus.
 */

/** Kas pusvalandį — pakankamai dažnai diegimui pastebėti, per retai, kad kliūtų. */
const TIKRINIMO_INTERVALAS_MS = 30 * 60 * 1000;

export function initServiceWorkerUpdates(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  // Ar puslapį JAU valdė service worker, kai jis atsidarė?
  //
  // Jei ne, vadinasi, tai pirmasis diegimas šioje naršyklėje, ir
  // `controllerchange` suveiks vien dėl `clientsClaim`. Pranešti tada būtų
  // klaidinga — jokios „naujos versijos“ nėra, tiesiog SW ką tik įsidiegė.
  const buvoValdomas = !!navigator.serviceWorker.controller;
  let parodyta = false;

  // Klausytojas prikabinamas PRIEŠ registraciją, kad įvykis nepraslystų.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!buvoValdomas || parodyta) return;
    parodyta = true;

    toast('Yra nauja versija', {
      description: 'Atnaujinkite, kad matytumėte naujausius pakeitimus.',
      duration: Infinity,
      action: {
        label: 'Atnaujinti',
        onClick: () => window.location.reload(),
      },
    });
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Naršyklė pati tikrina, ar `sw.js` pasikeitė, tik naršant. Montuotojo
        // PWA gali būti atidaryta visą dieną be nė vieno perkrovimo, tad
        // tikriname ir periodiškai, ir kaskart grįžus į programą.
        const tikrinti = () => { void reg.update().catch(() => { /* be tinklo — nesvarbu */ }); };

        window.setInterval(tikrinti, TIKRINIMO_INTERVALAS_MS);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') tikrinti();
        });
      })
      .catch(() => { /* registracija nepavyko — programa veikia ir be SW */ });
  });
}
