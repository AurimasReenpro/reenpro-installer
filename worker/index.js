/**
 * Vartai prieš montavimo sistemos statinius failus.
 *
 * SVARBU: veikia tik su `assets.run_worker_first: true`. Be jos Workers
 * atiduoda failus NEPALEIDĘS šio kodo, ir patikra būtų apeinama.
 *
 * Tvarka tokia pati kaip kitose Reenpro programėlėse:
 *   1. Cloudflare Access patikrina, ar žmogus apskritai įleidžiamas.
 *   2. Čia patikrinamas Access JWT parašas.
 *   3. D1 pasakoma, ar tas el. paštas turi teisę į šią programėlę.
 *
 * Duomenų šis Workeris neliečia — jie lieka Supabase. Čia tik durys.
 */

import { authenticate, AccessError } from "./access.js";
import { lookupUser, isEntitled, parseGroups, UsersError } from "./users.js";
import { page, icon, escapeHtml } from "./theme.js";
import { LOGO_LIGHT } from "./logo.js";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

/**
 * Vite failų varduose yra maiša (`index-Bjdrfl5z.js`), tad turinys niekada
 * nesikeičia nekeičiant vardo — juos galima laikyti naršyklėje ilgai.
 *
 * `private`, o ne `public`: programa už Access, ir jos failai neturi gulėti
 * bendrose tarpinėse talpyklose.
 */
const HASHED = /-[A-Za-z0-9_-]{8,}\.(js|mjs|css|woff2?|png|svg|jpg|jpeg|webp)$/i;

function cacheFor(pathname) {
  if (HASHED.test(pathname)) return "private, max-age=31536000, immutable";
  // index.html ir viskas kita – visada šviežia, kitaip po diegimo žmonės
  // liktų su sena programa ir nesuprastų kodėl.
  return "no-store";
}

function noticePage({ title, iconName, paragraphs, detailLabel, detail, dashboardUrl }) {
  return page({
    title: `${title} · Reenpro`,
    body: `<div class="center"><div class="center-stack">
<img class="logo-lg" src="${LOGO_LIGHT}" alt="Reenpro" width="738" height="141">
<main class="notice">
  <p class="eyebrow">Montavimo sistema</p>
  <div class="notice-icon">${icon(iconName, 40)}</div>
  <h1>${escapeHtml(title)}</h1>
  ${paragraphs.map((t) => `<p>${escapeHtml(t)}</p>`).join("\n  ")}
  ${
    dashboardUrl
      ? `<p><a class="back" href="${escapeHtml(dashboardUrl)}">${icon("arrow-left", 16)}Grįžti į programėlių sąrašą</a></p>`
      : ""
  }
  ${detail ? `<div class="detail"><b>${escapeHtml(detailLabel)}</b>${escapeHtml(detail)}</div>` : ""}
</main>
</div></div>`,
  });
}

const deny = (body) =>
  new Response(body, {
    status: 403,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8" },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let email;
    let groups;

    try {
      ({ email } = await authenticate(request, env));
      ({ groups } = await lookupUser(env.DB, email));
    } catch (error) {
      const message =
        error instanceof AccessError || error instanceof UsersError
          ? error.message
          : "Netikėta klaida tikrinant prieigą.";

      return deny(
        noticePage({
          title: "Prieiga negalima",
          iconName: "lock",
          paragraphs: [
            "Tapatybės patvirtinti nepavyko, todėl sistema neatidaroma. " +
              "Užverkite naršyklės langą ir prisijunkite iš naujo. Jei kartojasi — " +
              "persiųskite šį pranešimą administratoriui.",
          ],
          detailLabel: "Priežastis",
          detail: message,
          dashboardUrl: env.DASHBOARD_URL,
        })
      );
    }

    if (!isEntitled(groups, { appId: env.APP_ID, appGroups: parseGroups(env.APP_GROUPS) })) {
      return deny(
        noticePage({
          title: "Programėlė nepriskirta",
          iconName: "circle-alert",
          paragraphs: [
            "Jūsų paskyra veikia, bet montavimo sistema jai nepriskirta. " +
              "Prieigą suteikia administratorius — parašykite jam, jei šio įrankio " +
              "reikia darbui.",
          ],
          detailLabel: "Jūsų paskyra",
          detail: email,
          dashboardUrl: env.DASHBOARD_URL,
        })
      );
    }

    // Praėjo. Statinis failas atiduodamas su tinkama talpyklos politika.
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    headers.set("Cache-Control", cacheFor(url.pathname));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
