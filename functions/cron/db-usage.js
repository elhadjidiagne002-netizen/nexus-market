/**
 * NEXUS Market — Cron : surveillance du quota Supabase (mitigation PM-04)
 * ═══════════════════════════════════════════════════════════════════════════
 * Vérifie la taille de la base via la RPC `db_usage` (cf.
 * database/migrations/2026_06_07_db_usage.sql) et alerte si l'usage dépasse un
 * seuil (défaut 70 %). Évite la panne « base en lecture seule » lors des pics.
 *
 * Déclenchement externe (cf. wrangler.toml — Cloudflare Pages ne supporte pas les
 * cron triggers natifs). Exemple cron-job.org, 1×/jour :
 *   GET https://nexus-market-asb.pages.dev/cron/db-usage?token=<CRON_SECRET>
 *
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET (ou NEXUS_WA_SECRET).
 * Optionnelles : DB_LIMIT_MB (défaut 500), DB_ALERT_PCT (défaut 70),
 *                ADMIN_USER_ID (UUID → notification in-app).
 */

const ADMIN_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) {
    return json({ error: 'Non autorisé — ?token= requis' }, 401);
  }
  return json(await runCheck(env));
}

// Support optionnel du handler scheduled (si un jour exécuté comme Worker).
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runCheck(env)); },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

async function runCheck(env) {
  const SB = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB || !KEY) return { error: 'SUPABASE_URL / SUPABASE_SERVICE_KEY manquantes' };

  const limitMb = parseInt(env.DB_LIMIT_MB || '500', 10);
  const alertPct = parseFloat(env.DB_ALERT_PCT || '70');
  const H = { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` };

  let usage;
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/db_usage`, {
      method: 'POST', headers: H, body: JSON.stringify({ p_limit_mb: limitMb }),
    });
    if (!r.ok) return { error: `RPC db_usage HTTP ${r.status}`, hint: 'Exécuter la migration 2026_06_07_db_usage.sql' };
    usage = await r.json();
  } catch (e) {
    return { error: 'Appel db_usage échoué', detail: String(e && e.message || e) };
  }

  const pct = Number(usage && usage.pct) || 0;
  const report = { run_at: new Date().toISOString(), ...usage, alert_pct: alertPct, alert: pct >= alertPct };

  if (report.alert) {
    console.warn(`[db-usage] ⚠️ Quota Supabase à ${pct}% (${usage.size_mb}/${usage.limit_mb} Mo)`);
    // Notification in-app admin (si UUID valide configuré).
    const adminId = (env.ADMIN_USER_ID || '').trim();
    if (ADMIN_UUID_RE.test(adminId)) {
      try {
        await fetch(`${SB}/rest/v1/notifications`, {
          method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({
            user_id: adminId, type: 'system',
            title: '⚠️ Quota base de données élevé',
            message: `La base Supabase est à ${pct}% (${usage.size_mb}/${usage.limit_mb} Mo). Pensez à purger ou passer en Pro avant le prochain pic.`,
            read: false,
          }),
        });
      } catch (e) { console.warn('[db-usage] notif admin échouée:', e.message); }
    }
    // Trace dans maintenance_log (best-effort).
    try {
      await fetch(`${SB}/rest/v1/maintenance_log`, {
        method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ job: 'db_usage_alert', result: report, run_at: report.run_at }),
      });
    } catch (_) {}
  }

  return report;
}
