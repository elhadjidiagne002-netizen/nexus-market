/**
 * NEXUS Market — Cron : EXPIRATION DES STORIES (minuterie de suppression)
 * ──────────────────────────────────────────────────────────────────────────
 * La durée de vie d'une story est fixée à la publication selon l'offre
 * d'abonnement du vendeur (cf. functions/api/stories/upload.js → expires_at).
 * La RLS masque déjà les stories expirées en lecture publique ; ce cron fait le
 * ménage en passant les stories actives dont expires_at est dépassé en
 * status='expired' (elles n'apparaissent plus et restent traçables).
 *
 * Déclencher par GET externe toutes les 10–30 min :
 *   GET https://nexus-market-asb.pages.dev/cron/expire-stories?token=CRON_SECRET
 *
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET (ou NEXUS_WA_SECRET).
 * ──────────────────────────────────────────────────────────────────────────
 */

const jsonR = (d, s = 200) => new Response(JSON.stringify(d, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } });

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) return jsonR({ error: 'Non autorisé — ?token=requis' }, 401);
  return jsonR(await expire(env));
}

export default { async scheduled(event, env, ctx) { ctx.waitUntil(expire(env)); } };

async function expire(env) {
  const SB = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY;
  const out = { run_at: new Date().toISOString(), expired: 0 };
  if (!SB || !KEY) return { ...out, error: 'SUPABASE_URL/SERVICE_KEY manquantes' };

  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  const nowIso = new Date().toISOString();
  try {
    // PATCH ciblé : stories actives dont la date d'expiration est dépassée.
    const q = `${SB}/rest/v1/stories?status=eq.active&expires_at=lt.${encodeURIComponent(nowIso)}`;
    const r = await fetch(q, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'expired' }),
    });
    if (!r.ok) return { ...out, error: 'PATCH HTTP ' + r.status + ' ' + (await r.text().catch(() => '')) };
    const rows = await r.json().catch(() => []);
    out.expired = Array.isArray(rows) ? rows.length : 0;
  } catch (e) { return { ...out, error: e.message }; }

  console.log('[expire-stories]', JSON.stringify(out));
  return out;
}
