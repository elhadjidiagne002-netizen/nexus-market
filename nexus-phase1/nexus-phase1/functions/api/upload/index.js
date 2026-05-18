/**
 * POST /api/upload
 * Proxy d'upload d'images vers imgBB sans exposer la clé API côté client.
 *
 * Body : multipart/form-data avec champ "image" (fichier ou base64)
 * Réponse : { url, delete_url, thumb }
 *
 * Variables d'env :
 *   IMGBB_API_KEY — la clé API imgBB (https://api.imgbb.com)
 *
 * ⚠️  IMPORTANT : la clé qui était dans NEXUS_CONFIG.imgbb.apiKey est compromise
 *      (publique dans le HTML). Régénérer une nouvelle clé sur imgbb.com et la
 *      mettre uniquement dans les variables d'env Cloudflare.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.IMGBB_API_KEY) {
    return json({ error: 'IMGBB_API_KEY non configurée côté serveur' }, 503);
  }

  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié' }, 401);
  }

  // ── Récupération de l'image (multipart ou base64 JSON) ───────────────────
  let imageData;
  const contentType = request.headers.get('Content-Type') || '';

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('image');
      if (!file) return json({ error: 'Champ "image" manquant' }, 400);

      // Limite taille (5 Mo)
      if (file.size > 5 * 1024 * 1024) {
        return json({ error: 'Image trop volumineuse (max 5 Mo)' }, 413);
      }

      const buf = await file.arrayBuffer();
      imageData = btoa(String.fromCharCode(...new Uint8Array(buf)));
    } else {
      const body = await request.json();
      imageData = body.image; // base64 sans préfixe data:
      if (!imageData) return json({ error: 'Champ "image" manquant' }, 400);
      // Si préfixe data:image/...;base64,xxx → garder seulement xxx
      if (imageData.includes(',')) imageData = imageData.split(',')[1];
    }
  } catch (e) {
    return json({ error: 'Erreur lecture image', detail: e.message }, 400);
  }

  // ── Upload vers imgBB ────────────────────────────────────────────────────
  try {
    const formData = new FormData();
    formData.append('key', env.IMGBB_API_KEY);
    formData.append('image', imageData);

    const res = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return json({ error: data.error?.message || 'Échec imgBB' }, 502);
    }

    return json({
      url: data.data.url,
      display_url: data.data.display_url,
      delete_url: data.data.delete_url,
      thumb: data.data.thumb?.url
    });
  } catch (e) {
    return json({ error: 'imgBB injoignable', detail: e.message }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
