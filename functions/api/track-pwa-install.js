// functions/api/track-pwa-install.js → POST /api/track-pwa-install
// Enregistre le résultat du prompt d'installation PWA (window.nexusInstall(),
// événement natif `beforeinstallprompt`) dans pwa_install_events, pour que le
// panneau admin "Statistiques de croissance" puisse afficher un nombre
// d'installations par jour. Public (l'installation a lieu avant/sans connexion),
// rate-limité par IP ; best-effort si l'utilisateur est connecté (user_id
// attaché, sans jamais bloquer l'appel si le token est absent/invalide).
import { supabase, options, err, requireAuth } from './_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from './_lib/ratelimit.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON invalide' }, 400); }

  const outcome = body?.outcome;
  if (outcome !== 'accepted' && outcome !== 'dismissed') {
    return json({ error: "outcome doit être 'accepted' ou 'dismissed'" }, 400);
  }
  const platform = typeof body?.platform === 'string' ? body.platform.slice(0, 40) : null;

  // Anti-abus léger : cet endpoint n'a aucune valeur pour un attaquant (pas de
  // lecture, pas d'action sensible) mais on borne quand même le volume d'écriture.
  const rl = await rateLimit(env, `pwa-install:${clientIp(request)}`, 20, 3600);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, CORS);

  // Best-effort : si un JWT valide est fourni, on relie l'événement à l'utilisateur.
  let userId = null;
  if (request.headers.get('Authorization')) {
    try {
      const [user] = await requireAuth(request, env);
      if (user?.id) userId = user.id;
    } catch (_) { /* pas bloquant */ }
  }

  try {
    const sb = supabase(env);
    await sb.from('pwa_install_events').insert({ outcome, platform, user_id: userId });
  } catch (e) {
    // Analytics non-critique : ne jamais faire échouer l'expérience d'install côté client.
    console.error('[track-pwa-install] insert échoué:', e.message);
  }
  return json({ ok: true });
}
