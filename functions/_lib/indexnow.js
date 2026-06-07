// functions/_lib/indexnow.js
// Notification instantanée aux moteurs compatibles IndexNow (Bing, Yandex, Seznam…)
// lors de la publication/modification/suppression d'une URL — au lieu d'attendre
// le prochain crawl. Protocole : https://www.indexnow.org/documentation
//
// La clé est publique par conception : elle doit être servie en clair à
// https://<host>/<key>.txt (cf. functions/api/indexnow.js GET, et le fichier
// public/<key>.txt). Surcharge possible via la variable d'env INDEXNOW_KEY.

export const INDEXNOW_KEY_DEFAULT = '6ae048af183b76c8b2a7e54acc1681c7';

export function indexNowKey(env) {
  return (env && env.INDEXNOW_KEY) || INDEXNOW_KEY_DEFAULT;
}

/**
 * Soumet une ou plusieurs URLs à IndexNow. Fail-safe : n'élève jamais (le SEO ne
 * doit pas casser un flux métier). À appeler idéalement via ctx.waitUntil(...).
 * @param {object} env  variables d'environnement Cloudflare
 * @param {string|string[]} urls  URLs absolues (même hôte que `host`)
 * @param {string} [origin]  ex. https://nexus-market-asb.pages.dev
 */
export async function submitToIndexNow(env, urls, origin) {
  try {
    const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
    if (!list.length) return { ok: false, skipped: 'no-urls' };

    const base = origin || env.SITE_URL || 'https://nexus-market-asb.pages.dev';
    const host = new URL(base).host;
    const key = indexNowKey(env);

    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `${base}/${key}.txt`,
        urlList: list.slice(0, 10000),
      }),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
