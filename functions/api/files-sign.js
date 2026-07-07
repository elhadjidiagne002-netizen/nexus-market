// functions/api/files-sign.js → GET /api/files-sign?key=<clé R2>  (ou ?url=/api/files/<clé>)
//
// [SEC 2026-07-07] Émet une URL signée à durée limitée pour un fichier payant R2,
// UNIQUEMENT si l'appelant y a droit :
//   • le VENDEUR propriétaire (la clé est namespacée `${user.id}/…` à l'upload) ;
//   • un ADMIN ;
//   • un ACHETEUR ayant une commande PAYÉE contenant ce fichier.
//
// Réponse : { ok:true, url:"/api/files/<clé>?exp=<ts>&sig=<hmac>" } (valide 10 min).
// Si FILE_URL_SECRET n'est pas défini, renvoie l'URL nue (le endpoint /files sert
// alors en libre accès — rétro-compatible ; le verrou s'active en posant le secret).
//
// Câblage front (à faire pour activer le verrou dur) : avant d'ouvrir un lien
// `/api/files/...`, appeler ce endpoint (avec le Bearer token) et ouvrir l'URL signée.
import { handle, requireAuth, ok, err } from './_lib/supabase.js';

const TTL_SECONDS = 600; // 10 min

async function sign(secret, key, exp) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(`${key}|${exp}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// L'acheteur a-t-il une commande payée contenant cette clé de fichier ?
async function buyerOwnsFile(env, userId, key) {
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?buyer_id=eq.${encodeURIComponent(userId)}` +
      `&payment_status=eq.paid&select=products&order=created_at.desc&limit=300`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  ).catch(() => null);
  if (!res?.ok) return false;
  const rows = await res.json().catch(() => []);
  for (const row of rows || []) {
    const items = Array.isArray(row.products) ? row.products : [];
    for (const p of items) {
      const urls = [p?.book_download_url, p?.file_url, p?.fileUrl, p?.downloadUrl];
      if (urls.some((u) => typeof u === 'string' && u.includes(key))) return true;
    }
  }
  return false;
}

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== 'GET') return err('GET uniquement', 405);
  const { user } = await requireAuth(env, request);

  const url = new URL(request.url);
  let key = url.searchParams.get('key') || '';
  if (!key) {
    // Accepter aussi ?url=/api/files/<clé>
    const u = url.searchParams.get('url') || '';
    const m = u.match(/\/api\/files\/(.+)$/);
    if (m) key = decodeURIComponent(m[1].split('?')[0]);
  }
  key = key.replace(/^\/+/, '');
  if (!key || key.includes('..')) return err('Clé de fichier invalide', 400);

  // Contrôle de droits : vendeur propriétaire (préfixe = son id), admin, ou acheteur payé.
  const isOwner = key.startsWith(`${user.id}/`);
  const isAdmin = user.role === 'admin';
  const entitled = isOwner || isAdmin || (await buyerOwnsFile(env, user.id, key));
  if (!entitled) return err('Accès non autorisé à ce fichier', 403);

  // Sans secret configuré : URL nue (le endpoint /files sert en libre accès).
  if (!env.FILE_URL_SECRET) return ok({ url: `/api/files/${key}`, signed: false });

  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const sig = await sign(env.FILE_URL_SECRET, key, exp);
  return ok({ url: `/api/files/${key}?exp=${exp}&sig=${sig}`, signed: true, expiresIn: TTL_SECONDS });
});
