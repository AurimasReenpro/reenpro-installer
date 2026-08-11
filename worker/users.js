/**
 * Naudotojų skaitymas iš D1 ir teisės į šią programėlę.
 *
 * Naudojama ta pati `reenpro-dashboard` bazė ir ta pati `users` lentelė
 * kaip dashboard'e – vienas sąrašas abiem vietoms.
 */

export class UsersError extends Error {}

/** Paverčia 'pardavimai, inzinerija' į ['pardavimai','inzinerija']. */
export function parseGroups(value) {
  return String(value || "")
    .split(",")
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Suranda naudotoją pagal el. paštą.
 *
 * @returns {Promise<{ known: boolean, groups: string[], name: string|null }>}
 */
export async function lookupUser(db, email) {
  if (!db) {
    // Fail closed: be duomenų bazės neturime pagrindo ką nors praleisti.
    throw new UsersError("D1 saitas nesukonfigūruotas.");
  }

  const key = String(email || "").trim().toLowerCase();
  if (!key) {
    return { known: false, groups: [], name: null };
  }

  let row;
  try {
    row = await db
      .prepare(
        "SELECT name, groups, active, is_admin FROM users WHERE email = ?1 LIMIT 1"
      )
      .bind(key)
      .first();
  } catch (error) {
    throw new UsersError(`Nepavyko perskaityti naudotojų lentelės: ${error.message}`);
  }

  if (!row || row.active !== 1) {
    return { known: false, groups: [], name: null, isAdmin: false };
  }

  return {
    known: true,
    groups: parseGroups(row.groups),
    name: row.name || null,
    isAdmin: row.is_admin === 1,
  };
}

/**
 * Ar naudotojui priskirta ši programėlė.
 *
 * Tikrinama ta pati logika kaip dashboard'o src/apps.js — kitaip žmogus
 * matytų kortelę sąraše, bet paspaudęs gautų atsisakymą (arba atvirkščiai).
 *
 *   `*`               – visos programėlės
 *   programėlės `id`  – tik ši viena
 *   grupė             – bet kuri iš appGroups
 *
 * @param {string[]} assigned  naudotojo reikšmės iš users.groups
 * @param {{ appId: string, appGroups: string[] }} app
 */
export function isEntitled(assigned, { appId, appGroups } = {}) {
  const list = Array.isArray(assigned) ? assigned : [];
  if (list.includes("*")) return true;
  if (appId && list.includes(appId)) return true;

  const groups = Array.isArray(appGroups) ? appGroups : [];
  return groups.some((g) => list.includes(g));
}
