// functions/api/indexnow.js → /api/indexnow
// GET  : sert la clé IndexNow (fallback si le fichier statique /<key>.txt manque).
// POST : soumet des URLs à IndexNow (Bing/Yandex…). À appeler après publication
//        ou modification d'un produit/annonce.
//
//   POST /api/indexnow            body: { "urls": ["https://.../produit/123"] }
//   POST /api/indexnow            body: { "ids": ["123"], "kind": "produit" }
//
// Sécurité : la soumission optionnelle peut être protégée par INDEXNOW_ADMIN_TOKEN
// (header X-Admin-Token). Sans variable configurée, l'endpoint reste ouvert mais
// inoffensif (ne fait que (re)signaler des URLs publiques du site).
//
// [FIX] Endpoint rendu autonome (helper JSON inline, sans dépendance d'import) et
// englobé dans un try/catch : toute erreur renvoie désormais un JSON lisible au
// lieu d'une 502 brute Cloudflare (l'ancienne version plantait sur le chemin POST).
import { submitToIndexNow, indexNowKey } from '../_lib/indexnow.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
};
const jsonResp = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const origin = env.SITE_URL || new URL(request.url).origin;
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (method === 'GET') {
      return new Response(indexNowKey(env), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
      });
    }

    if (method !== 'POST') return jsonResp({ error: 'GET ou POST uniquement' }, 405);

    if (env.INDEXNOW_ADMIN_TOKEN) {
      if (request.headers.get('X-Admin-Token') !== env.INDEXNOW_ADMIN_TOKEN) {
        return jsonResp({ error: 'Non autorisé' }, 401);
      }
    }

    let body = {};
    try { body = await request.json(); } catch { /* corps vide accepté */ }

    let urls = Array.isArray(body.urls) ? body.urls : [];
    if (!urls.length && Array.isArray(body.ids)) {
      const kind = body.kind === 'annonce' ? 'annonce' : 'produit';
      urls = body.ids.map((id) => `${origin}/${kind}/${encodeURIComponent(id)}`);
    }
    // Normalise les chemins relatifs en URLs absolues du site.
    urls = urls.map((u) => (/^https?:\/\//i.test(u) ? u : `${origin}${u.startsWith('/') ? '' : '/'}${u}`));

    if (!urls.length) return jsonResp({ submitted: 0, ok: false, skipped: 'no-urls' }, 400);

    // Fire-and-forget : la sous-requête externe (api.indexnow.org) ne doit pas
    // bloquer ni faire échouer la réponse (un échec plateforme du fetch sortant
    // surfaçait en 502 brute non rattrapable). On répond 202 immédiatement et la
    // soumission part en tâche de fond, best-effort.
    const task = submitToIndexNow(env, urls, origin).catch(() => {});
    if (typeof context.waitUntil === 'function') context.waitUntil(task);
    return jsonResp({ submitted: urls.length, ok: true, queued: true }, 202);
  } catch (e) {
    return jsonResp({ ok: false, error: String((e && e.message) || e) }, 500);
  }
}
