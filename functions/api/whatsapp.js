/**
 * NEXUS Market — Cloudflare Pages Function : /api/whatsapp
 * ──────────────────────────────────────────────────────────
 * Route : POST /api/whatsapp
 * Rôle  : Proxy sécurisé vers Green API (les credentials restent serveur).
 *
 * Déploiement :
 *   Placer ce fichier dans /functions/api/whatsapp.js de votre repo.
 *   Cloudflare Pages le sert automatiquement à /api/whatsapp.
 *
 * Variables d'environnement (Cloudflare Dashboard → Settings → Variables) :
 *   GREEN_API_INSTANCE_ID    ex: "7103123456"
 *   GREEN_API_TOKEN          ex: "abc123def456..."
 *   NEXUS_WA_SECRET          clé secrète pour authentifier les appels frontend
 *
 * Body JSON attendu :
 * {
 *   "phone":    "221771234567",       // format international, sans +
 *   "message":  "Texte du message",
 *   "secret":   "NEXUS_WA_SECRET",   // clé partagée frontend→worker
 *   "type":     "text"               // "text" | "file" (optionnel)
 * }
 */

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  // ── CORS ──────────────────────────────────────────────────────────────
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Authentification ──────────────────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Corps JSON invalide' }, 400, corsHeaders); }

  const secret  = env.NEXUS_WA_SECRET || '';
  if (secret && body.secret !== secret) {
    return json({ ok: false, error: 'Non autorisé' }, 401, corsHeaders);
  }

  const instanceId = env.GREEN_API_INSTANCE_ID;
  const apiToken   = env.GREEN_API_TOKEN;

  if (!instanceId || !apiToken) {
    return json({ ok: false, error: 'Green API non configuré (variables d\'env manquantes)' }, 500, corsHeaders);
  }
  if (!body.phone || !body.message) {
    return json({ ok: false, error: 'phone et message sont requis' }, 400, corsHeaders);
  }

  // ── Normalisation du numéro ───────────────────────────────────────────
  // Green API attend : "221771234567@c.us" (sans +, avec @c.us)
  const rawPhone  = String(body.phone).replace(/\D/g, '');
  const chatId    = rawPhone.startsWith('221') ? rawPhone + '@c.us'
                  : rawPhone.length === 9      ? '221' + rawPhone + '@c.us'
                  : rawPhone + '@c.us';

  // ── Appel Green API ───────────────────────────────────────────────────
  const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`;

  let gaRes;
  try {
    gaRes = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chatId, message: body.message }),
    });
  } catch (err) {
    return json({ ok: false, error: 'Green API injoignable : ' + err.message }, 502, corsHeaders);
  }

  const gaData = await gaRes.json().catch(() => ({}));

  if (!gaRes.ok) {
    return json(
      { ok: false, error: 'Green API erreur ' + gaRes.status, detail: gaData },
      gaRes.status, corsHeaders
    );
  }

  // ── Log Supabase (optionnel) ──────────────────────────────────────────
  // Enregistre chaque envoi dans la table whatsapp_logs pour le suivi admin.
  // Décommenter si vous avez configuré les variables SUPABASE_URL + SUPABASE_SERVICE_KEY.
  /*
  const sbUrl   = env.SUPABASE_URL;
  const sbKey   = env.SUPABASE_SERVICE_KEY;
  if (sbUrl && sbKey) {
    await fetch(`${sbUrl}/rest/v1/whatsapp_logs`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        sbKey,
        'Authorization': 'Bearer ' + sbKey,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        phone:       rawPhone,
        message:     body.message.slice(0, 500),
        template:    body.template || null,
        status:      'sent',
        green_id:    gaData.idMessage || null,
        created_at:  new Date().toISOString(),
      }),
    }).catch(() => {});
  }
  */

  return json({ ok: true, idMessage: gaData.idMessage, chatId }, 200, corsHeaders);
}

// GET pour test de santé
export async function onRequestGet(ctx) {
  const configured = !!(ctx.env.GREEN_API_INSTANCE_ID && ctx.env.GREEN_API_TOKEN);
  return json({
    service:     'NEXUS WhatsApp Gateway',
    status:      configured ? 'ready' : 'not_configured',
    configured,
    timestamp:   new Date().toISOString(),
  }, 200, { 'Access-Control-Allow-Origin': '*' });
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
