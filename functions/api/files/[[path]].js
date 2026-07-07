// functions/api/files/[[path]].js → GET /api/files/<clé>
// Sert un fichier stocké dans Cloudflare R2 (binding env.PDF_BUCKET) — utilisé
// pour les produits numériques (PDF / eBook / audio) téléversés via
// /api/storage/upload. Lecture seule, en flux (pas de bufferisation).
//
// [SEC 2026-07-07] Contenu PAYANT → durcissement pour éviter la fuite de fichiers :
//   1. `X-Robots-Tag: noindex` + `nosniff` → jamais indexé par Google/Bing/IA
//      (ferme immédiatement le vecteur « lien payant surfacé dans les SERP »).
//   2. Assainissement de clé (rejette `..`, clé absolue/vide → pas d'accès hors périmètre).
//   3. URL signée OPTIONNELLE : si `FILE_URL_SECRET` est défini, on EXIGE un jeton
//      `?exp=<ts>&sig=<hmac>` valide (HMAC-SHA256 sur `clé|exp`, non expiré),
//      généré par l'acheteur autorisé via /api/files-sign. Tant que le secret
//      n'est PAS défini, comportement inchangé (rétro-compatible, aucune casse).
//      → Pour activer le verrou dur : définir FILE_URL_SECRET côté Cloudflare
//        PUIS câbler le front sur /api/files-sign (voir ce fichier).

function bad(status, msg) {
  return new Response(msg, {
    status,
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
  });
}

// Comparaison à temps constant de deux chaînes hex (anti timing-attack).
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validSignature(env, key, exp, sig) {
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false; // expiré
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(env.FILE_URL_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(`${key}|${exp}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, String(sig).toLowerCase());
}

export async function onRequestGet({ env, params, request }) {
  const bucket = env.PDF_BUCKET;
  if (!bucket) return bad(503, 'Stockage non configuré');

  const key = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  // Assainissement : pas de clé vide, pas de traversée, pas de clé absolue.
  if (!key || key.includes('..') || key.startsWith('/')) return bad(404, 'Not found');

  const url = new URL(request.url);

  // Verrou dur optionnel : si un secret de signature est configuré, exiger un
  // jeton signé valide (émis par /api/files-sign à un acheteur autorisé).
  if (env.FILE_URL_SECRET) {
    const okSig = await validSignature(env, key, url.searchParams.get('exp'), url.searchParams.get('sig'));
    if (!okSig) return bad(403, 'Lien de téléchargement invalide ou expiré');
  }

  const obj = await bucket.get(key);
  if (!obj || !obj.body) return bad(404, 'Fichier introuvable');

  const h = new Headers();
  h.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream');
  if (obj.size != null) h.set('Content-Length', String(obj.size));
  if (obj.httpEtag) h.set('ETag', obj.httpEtag);
  // Contenu payant : jamais indexé, jamais sniffé, jamais mis en cache partagé.
  h.set('X-Robots-Tag', 'noindex, nofollow');
  h.set('X-Content-Type-Options', 'nosniff');
  // ?dl=1 force le téléchargement ; sinon lecture inline (lecteur PDF navigateur).
  h.set('Content-Disposition', url.searchParams.get('dl') === '1' ? 'attachment' : 'inline');
  h.set('Cache-Control', 'private, no-store');
  return new Response(obj.body, { headers: h });
}
