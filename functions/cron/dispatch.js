/**
 * NEXUS Market — Cron : avance le DISPATCH COURSIER en cascade (timeouts)
 * ──────────────────────────────────────────────────────────────────────────
 * Fait passer chaque course « en recherche » dont l'offre active a EXPIRÉ au
 * coursier suivant le plus proche — même si aucun mandataire ne regarde l'écran.
 * Notifie ensuite le nouveau coursier par WhatsApp (best-effort).
 *
 * Cloudflare Pages n'a pas de cron natif → déclencher par GET externe
 * (cron-job.org, GitHub Actions, UptimeRobot…) toutes les 1 à 2 minutes :
 *
 *    GET https://nexus-market-asb.pages.dev/cron/dispatch?token=VOTRE_SECRET
 *
 * Variables d'environnement Cloudflare (Settings → Variables) :
 *   SUPABASE_URL          = https://pqcqbstbdujzaclsiosv.supabase.co
 *   SUPABASE_SERVICE_KEY  = eyJ...        (clé service_role — SECRET)
 *   CRON_SECRET ou NEXUS_WA_SECRET = secret partagé pour autoriser l'appel
 *   (notif WhatsApp, optionnel) NEXUS_WA_SECRET + Green API déjà configurés.
 * ──────────────────────────────────────────────────────────────────────────
 */

export async function onRequestGet({ request, env }) {
  const token  = new URL(request.url).searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) {
    return json({ error: 'Non autorisé — ?token=requis' }, 401);
  }
  const result = await runDispatchTick(env, request);
  return json(result, 200);
}

// Bloc cron natif (ignoré par Pages, utile si un Worker dédié réutilise ce fichier).
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runDispatchTick(env, null)); },
};

async function runDispatchTick(env, request) {
  const SUPABASE_URL = env.SUPABASE_URL || 'https://pqcqbstbdujzaclsiosv.supabase.co';
  const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return { error: 'SUPABASE_SERVICE_KEY non configurée' };

  const headers = {
    'Content-Type':  'application/json',
    'apikey':        SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
  };

  const out = { run_at: new Date().toISOString(), advanced: 0, notified: 0 };

  // 1) Avancer toutes les cascades expirées (RPC SQL)
  let notify = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dispatch_tick_all`, {
      method: 'POST', headers, body: JSON.stringify({}),
    });
    if (!r.ok) return { ...out, error: `RPC dispatch_tick_all ${r.status}: ${await r.text()}` };
    const data = await r.json();
    out.advanced = data?.advanced || 0;
    notify = Array.isArray(data?.notify) ? data.notify : [];
  } catch (e) {
    return { ...out, error: e.message };
  }

  // 2) Notifier le nouveau coursier de chaque course (WhatsApp + Web Push, best-effort)
  if (notify.length && request) {
    const origin = new URL(request.url).origin;
    for (const n of notify) {
      // a) WhatsApp
      const phone = normPhone(n.phone);
      if (phone) {
        try {
          const res = await fetch(`${origin}/api/whatsapp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': env.INTERNAL_API_SECRET || env.CRON_SECRET || '' },
            body: JSON.stringify({ secret: env.NEXUS_WA_SECRET, phone, message: buildMessage(n), event: 'courier_new_delivery' }),
          });
          if (res.ok) out.notified++;
        } catch (_) { /* best-effort */ }
      }
      // b) Web Push (notif arrière-plan, app fermée) — ciblé par user_id du coursier
      if (n.user_id) {
        try {
          await fetch(`${origin}/push-send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': env.INTERNAL_API_SECRET || env.CRON_SECRET || '' },
            body: JSON.stringify({
              userId: n.user_id,
              title:  '🛵 Nouvelle course NEXUS !',
              body:   (n.pickup_label || 'Retrait') + ' → ' + (n.dropoff_label || 'Livraison')
                      + (n.courier_payout != null ? ' · ' + fcfa(n.courier_payout) : ''),
              url:    '/',
            }),
          });
          out.pushed = (out.pushed || 0) + 1;
        } catch (_) { /* best-effort */ }
      }
    }
  }

  console.log('[Cron dispatch]', JSON.stringify(out));
  return out;
}

function buildMessage(n) {
  const parts = ['🛵 *NEXUS — Nouvelle course disponible !*'];
  if (n.distance_km != null) parts.push('📍 À ~' + Number(n.distance_km).toFixed(1) + ' km de vous');
  if (n.pickup_label)  parts.push('📦 Retrait : ' + n.pickup_label);
  if (n.dropoff_label) parts.push('🎯 Livraison : ' + n.dropoff_label);
  if (n.course_km != null) parts.push('🛣️ Distance : ' + Number(n.course_km).toFixed(1) + ' km');
  if (n.courier_payout != null) parts.push('💰 Votre gain : ' + fcfa(n.courier_payout));
  else if (n.fee_fcfa != null)  parts.push('💰 Montant : ' + fcfa(n.fee_fcfa));
  parts.push('', '⚡ *Premier qui accepte remporte la course.*', '👉 Connectez-vous pour valider.');
  return parts.join('\n');
}

function fcfa(v) {
  const n = Number(v);
  return (isNaN(n) ? 0 : n).toLocaleString('fr-FR') + ' FCFA';
}

// Sénégal : 9 chiffres commençant par 7 → préfixe 221 ; sinon chiffres seuls.
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 9 && d[0] === '7') d = '221' + d;
  if (d.indexOf('00') === 0) d = d.slice(2);
  return d;
}

function json(body, status) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
