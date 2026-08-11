/**
 * Cloudflare Access JWT validacija.
 *
 * Kopija iš reenpro-dashboard projekto. Keičiant vienoje vietoje –
 * atnaujinti ir kitoje.
 *
 * Kodėl to reikia: Access antraštę `Cf-Access-Jwt-Assertion` prideda
 * Cloudflare, bet Workerį galima pasiekti ir apeinant Access. Nepatikrinus
 * parašo, bet kas galėtų atsiųsti savo antraštę su svetimu el. paštu.
 * Todėl parašas tikrinamas pagal Cloudflare viešuosius raktus.
 */

const JWT_HEADER = "Cf-Access-Jwt-Assertion";
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 val.

/** @type {{ teamDomain: string, keys: Map<string, CryptoKey>, fetchedAt: number } | null} */
let jwksCache = null;

export class AccessError extends Error {}

function base64UrlToBytes(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const binary = atob(normalized + "=".repeat(padding));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToJson(input) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(input)));
}

async function loadJwks(teamDomain) {
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });

  if (!response.ok) {
    throw new AccessError(`Nepavyko gauti JWKs (HTTP ${response.status})`);
  }

  const body = await response.json();
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new AccessError("JWKs atsakyme nėra raktų");
  }

  const keys = new Map();
  for (const jwk of body.keys) {
    if (!jwk.kid) continue;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    keys.set(jwk.kid, key);
  }

  jwksCache = { teamDomain, keys, fetchedAt: Date.now() };
  return keys;
}

async function getVerificationKey(teamDomain, kid) {
  const fresh =
    jwksCache &&
    jwksCache.teamDomain === teamDomain &&
    Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;

  if (fresh && jwksCache.keys.has(kid)) {
    return jwksCache.keys.get(kid);
  }

  // Nežinomas kid arba pasenusi talpykla – Cloudflare sukeitė raktus.
  const keys = await loadJwks(teamDomain);
  const key = keys.get(kid);
  if (!key) {
    throw new AccessError(`JWKs neturi rakto kid=${kid}`);
  }
  return key;
}

/**
 * Patikrina Access JWT ir grąžina jo claims.
 *
 * @param {string} token
 * @param {{ teamDomain: string, aud: string }} options
 *   aud – viena arba kelios kableliais atskirtos reikšmės. Production ir
 *   Preview yra atskiros Access aplikacijos su skirtingais aud, todėl
 *   norint, kad veiktų abi, reikia išvardyti abi.
 */
export async function verifyAccessJwt(token, { teamDomain, aud }) {
  const allowedAudiences = String(aud || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  if (allowedAudiences.length === 0) {
    throw new AccessError("Nenurodyta nė viena leidžiama aud reikšmė.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AccessError("Netaisyklingos formos JWT");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header;
  try {
    header = base64UrlToJson(encodedHeader);
  } catch {
    throw new AccessError("Nepavyko perskaityti JWT antraštės");
  }

  // Būtina: kitaip galimas "alg confusion" – pvz. alg:none arba HS256.
  if (header.alg !== "RS256") {
    throw new AccessError(`Netikėtas parašo algoritmas: ${header.alg}`);
  }
  if (!header.kid) {
    throw new AccessError("JWT antraštėje nėra kid");
  }

  const key = await getVerificationKey(teamDomain, header.kid);

  const signatureValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );

  if (!signatureValid) {
    throw new AccessError("Neteisingas JWT parašas");
  }

  const claims = base64UrlToJson(encodedPayload);
  const now = Math.floor(Date.now() / 1000);
  const skew = 60; // laikrodžių nesutapimo atsarga

  if (typeof claims.exp === "number" && now >= claims.exp + skew) {
    throw new AccessError("JWT nebegalioja");
  }
  if (typeof claims.nbf === "number" && now < claims.nbf - skew) {
    throw new AccessError("JWT dar negalioja");
  }

  const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!tokenAudiences.some((a) => allowedAudiences.includes(a))) {
    throw new AccessError("JWT aud nesutampa su šios programos aud");
  }

  const expectedIssuer = `https://${teamDomain}`;
  if (claims.iss !== expectedIssuer) {
    throw new AccessError("JWT iss nesutampa su komandos domenu");
  }

  if (!claims.email) {
    throw new AccessError("JWT nėra el. pašto");
  }

  return claims;
}

/**
 * Nustato prisijungusį naudotoją.
 *
 * Vietiniame `wrangler dev` (localhost) leidžia apsimesti naudotoju per
 * .dev.vars DEV_EMAIL. Produkcijoje šis kelias neįmanomas, nes tikrinamas
 * tikrasis hostname.
 *
 * @returns {Promise<{ email: string, claims: object|null }>}
 */
export async function authenticate(request, env) {
  const hostname = new URL(request.url).hostname;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";

  if (isLocal && env.DEV_EMAIL) {
    return { email: String(env.DEV_EMAIL).toLowerCase(), claims: null };
  }

  if (!env.ACCESS_AUD) {
    throw new AccessError(
      "ACCESS_AUD nenustatytas – Workeris neturi su kuo palyginti JWT."
    );
  }

  const token = request.headers.get(JWT_HEADER);
  if (!token) {
    throw new AccessError(
      "Trūksta Cf-Access-Jwt-Assertion antraštės – užklausa atėjo ne per Access."
    );
  }

  const claims = await verifyAccessJwt(token, {
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    aud: env.ACCESS_AUD,
  });

  return { email: String(claims.email).toLowerCase(), claims };
}
