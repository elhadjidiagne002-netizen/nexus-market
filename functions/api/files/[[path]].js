// functions/api/files/[[path]].js → GET /api/files/<clé>
// Sert un fichier stocké dans Cloudflare R2 (binding env.PDF_BUCKET) — utilisé
// pour les produits numériques (PDF / eBook / audio) téléversés via
// /api/storage/upload. Lecture seule, en flux (pas de bufferisation).
export async function onRequestGet({ env, params }) {
  const bucket = env.PDF_BUCKET;
  if (!bucket) return new Response('Stockage non configuré', { status: 503 });

  const key = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  if (!key) return new Response('Not found', { status: 404 });

  const obj = await bucket.get(key);
  if (!obj || !obj.body) return new Response('Fichier introuvable', { status: 404 });

  const h = new Headers();
  h.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream');
  if (obj.size != null) h.set('Content-Length', String(obj.size));
  if (obj.httpEtag) h.set('ETag', obj.httpEtag);
  // Inline : ouverture dans le lecteur PDF du navigateur (« Lire en ligne »).
  // Le bouton « Télécharger » force le téléchargement via ?dl=1.
  h.set('Content-Disposition', 'inline');
  h.set('Cache-Control', 'private, max-age=3600');
  return new Response(obj.body, { headers: h });
}
