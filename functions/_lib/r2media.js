// functions/_lib/r2media.js
// [R2 — auto-migration read-through] Lit un objet média depuis Cloudflare R2 en
// PRIORITÉ, avec repli sur Supabase Storage (URL publique) + PEUPLEMENT de R2 au
// passage. Objectif : sortir DÉFINITIVEMENT l'égress média de Supabase — R2 a un
// égress GRATUIT/illimité (c'est le mur qui a bloqué le projet : Cached Egress).
//
// Chaque objet est lu depuis Supabase AU PLUS UNE FOIS (au tout premier accès),
// puis servi depuis R2 pour toujours → l'égress Supabase récurrent tombe à ~0,
// sans script de migration (le trafic migre lui-même).
//
// SÉCURITÉ DÉPLOIEMENT : sans le binding `MEDIA_BUCKET` configuré (bucket R2 pas
// encore créé/branché), le helper se comporte à 100 % comme avant (Supabase seul).
// → Il est donc SÛR de déployer ce code avant d'avoir créé le bucket R2.
//
// Retour : { buf: ArrayBuffer, contentType, source: 'r2'|'supabase' } ou { error }.

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function getMediaObject(context, bucketName, objectPath) {
  const { env } = context;
  const key = `${bucketName}/${objectPath}`;

  // 1) R2 d'abord (égress gratuit).
  if (env.MEDIA_BUCKET) {
    try {
      const obj = await env.MEDIA_BUCKET.get(key);
      if (obj) {
        return {
          buf: await obj.arrayBuffer(),
          contentType: (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
          source: 'r2',
        };
      }
    } catch (_) { /* R2 indisponible → repli Supabase */ }
  }

  // 2) Repli Supabase (URL publique) + peuplement R2 pour les accès suivants.
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const sourceUrl = `${base}/storage/v1/object/public/${bucketName}/${objectPath}`;
  const r = await fetch(sourceUrl, { cf: { cacheEverything: true, cacheTtl: ONE_YEAR } });
  if (!r.ok) return { error: r.status };
  const buf = await r.arrayBuffer();
  const contentType = r.headers.get('Content-Type') || 'application/octet-stream';

  if (env.MEDIA_BUCKET) {
    try {
      const put = env.MEDIA_BUCKET.put(key, buf, { httpMetadata: { contentType } });
      if (context.waitUntil) context.waitUntil(put); else await put;
    } catch (_) { /* peuplement best-effort, ne casse jamais la réponse */ }
  }
  return { buf, contentType, source: 'supabase' };
}

// Extrait le chemin d'objet d'une URL Supabase Storage publique :
//   https://…/storage/v1/object/public/<bucket>/<path>  →  <path>
export function objectPathFromPublicUrl(url, bucketName) {
  if (!url) return null;
  const m = String(url).match(new RegExp('/storage/v1/object/public/' + bucketName + '/(.+)$'));
  return m ? m[1] : null;
}
