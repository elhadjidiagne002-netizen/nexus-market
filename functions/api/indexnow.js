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
import { submitToIndexNow, indexNowKey } from '../_lib/indexnow.js';
import { json, err } from './_lib/response.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    return new Response(indexNowKey(env), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  if (method !== 'POST') return err('GET ou POST uniquement', 405);

  if (env.INDEXNOW_ADMIN_TOKEN) {
    const tok = request.headers.get('X-Admin-Token');
    if (tok !== env.INDEXNOW_ADMIN_TOKEN) return err('Non autorisé', 401);
  }

  let body = {};
  try { body = await request.json(); } catch { /* corps vide accepté */ }

  let urls = Array.isArray(body.urls) ? body.urls : [];
  if (!urls.length && Array.isArray(body.ids)) {
    const kind = body.kind === 'annonce' ? 'annonce' : 'produit';
    urls = body.ids.map(id => `${origin}/${kind}/${encodeURIComponent(id)}`);
  }
  // Normalise les chemins relatifs en URLs absolues du site.
  urls = urls.map(u => (/^https?:\/\//i.test(u) ? u : `${origin}${u.startsWith('/') ? '' : '/'}${u}`));

  const result = await submitToIndexNow(env, urls, origin);
  return json({ submitted: urls.length, ...result }, result.ok ? 200 : 502);
}
