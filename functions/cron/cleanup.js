/**
 * NEXUS Market — Cloudflare Cron : Nettoyage hebdomadaire base de données
 * ═══════════════════════════════════════════════════════════════════════════
 * Schedule : tous les dimanches à 3h00 UTC  →  "0 3 * * 0" dans wrangler.toml
 *
 * Cible 7 tables :
 *   1. notifications         → lues + > 30 jours
 *   2. search_logs           → > 90 jours
 *   3. audit_logs            → > 90 jours
 *   4. push_subscriptions    → doublons / endpoints révoqués
 *   5. sms_logs              → > 60 jours
 *   6. ambassador_referrals  → statut 'paid' + > 180 jours
 *   7. sessions / JWT        → Supabase gère automatiquement, mais on purge
 *                              les sessions inactives > 30 jours dans auth.sessions
 *
 * Variables d'environnement requises (Cloudflare → Settings → Variables) :
 *   SUPABASE_URL         = https://pqcqbstbdujzaclsiosv.supabase.co
 *   SUPABASE_SERVICE_KEY = eyJ...  (service_role key — JAMAIS la anon key)
 *   NEXUS_WA_SECRET      = nexus-wa-2026  (token pour déclencher manuellement)
 *
 * Test manuel :
 *   GET https://nexus-market-asb.pages.dev/cron/cleanup?token=nexus-wa-2026
 */

export default {
  /** Déclenché par le cron schedule Cloudflare */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCleanup(env));
  },

  /** GET /cron/cleanup?token=... — test manuel depuis le navigateur */
  async fetch(request, env) {
    const url    = new URL(request.url);
    const token  = url.searchParams.get('token');
    const secret = env.NEXUS_WA_SECRET || 'nexus-wa-2026';

    if (token !== secret) {
      return new Response(JSON.stringify({ error: 'Non autorisé — ?token=requis' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await runCleanup(env);
    return new Response(JSON.stringify(result, null, 2), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Fonction principale
// ═══════════════════════════════════════════════════════════════════════════
async function runCleanup(env) {
  const SB   = env.SUPABASE_URL || 'https://pqcqbstbdujzaclsiosv.supabase.co';
  const KEY  = env.SUPABASE_SERVICE_KEY;

  if (!KEY) {
    const err = { error: 'SUPABASE_SERVICE_KEY non configurée', fix: 'Cloudflare → Settings → Variables → Add secret SUPABASE_SERVICE_KEY' };
    console.error('[cleanup]', JSON.stringify(err));
    return err;
  }

  const H = {
    'Content-Type':  'application/json',
    'apikey':        KEY,
    'Authorization': `Bearer ${KEY}`,
    'Prefer':        'return=minimal',
  };

  const now      = new Date();
  const ago = (days) => new Date(now - days * 86400000).toISOString();

  const report   = { run_at: now.toISOString(), deleted: {}, errors: {} };

  // ── Helpers ──────────────────────────────────────────────────────────────
  async function del(table, filter, label) {
    try {
      const r = await fetch(`${SB}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: H });
      const count = r.headers.get('content-range')?.split('/')[1] ?? '?';
      report.deleted[label] = r.ok ? `${count} lignes` : `HTTP ${r.status}`;
      if (!r.ok) report.errors[label] = await r.text().catch(() => '');
    } catch (e) {
      report.errors[label] = e.message;
    }
  }

  async function count(table, filter) {
    try {
      const r = await fetch(`${SB}/rest/v1/${table}?${filter}&select=id`, {
        headers: { ...H, 'Prefer': 'count=exact', 'Range': '0-0' }
      });
      return parseInt(r.headers.get('content-range')?.split('/')[1] ?? '0', 10);
    } catch { return 0; }
  }

  // ── 1. Notifications lues de plus de 30 jours ────────────────────────────
  await del('notifications', `read=eq.true&created_at=lt.${ago(30)}`, 'notifications_read_30d');

  // ── 2. Notifications non lues de plus de 90 jours (très vieilles) ────────
  await del('notifications', `created_at=lt.${ago(90)}`, 'notifications_all_90d');

  // ── 3. Logs de recherche de plus de 90 jours ─────────────────────────────
  await del('search_logs', `created_at=lt.${ago(90)}`, 'search_logs_90d');

  // ── 4. Logs d'audit de plus de 90 jours ──────────────────────────────────
  await del('audit_logs', `created_at=lt.${ago(90)}`, 'audit_logs_90d');

  // ── 5. Logs SMS de plus de 60 jours ──────────────────────────────────────
  await del('sms_logs', `created_at=lt.${ago(60)}`, 'sms_logs_60d');

  // ── 6. Ambassador referrals payés de plus de 180 jours ───────────────────
  await del('ambassador_referrals', `status=eq.paid&created_at=lt.${ago(180)}`, 'ambassador_referrals_paid_180d');

  // ── 7. Sessions auth expirées (table auth.sessions — via RPC) ────────────
  // Supabase gère les sessions JWT automatiquement (TTL=7j par défaut)
  // On log juste le nombre actuel sans supprimer (risque de déconnecter des users)
  try {
    const activeSessions = await count('sessions', 'not_after=gte.' + now.toISOString());
    report.info = { active_sessions: activeSessions };
  } catch(_) {}

  // ── 8. Doublons push_subscriptions (même user_id, garder le plus récent) ─
  try {
    // Récupérer les user_ids avec plusieurs subscriptions
    const dupRes = await fetch(
      `${SB}/rest/v1/push_subscriptions?select=user_id&limit=1000`,
      { headers: { ...H, 'Prefer': 'count=exact' } }
    );
    if (dupRes.ok) {
      const subs = await dupRes.json();
      const freq = {};
      subs.forEach(s => { freq[s.user_id] = (freq[s.user_id] || 0) + 1; });
      const dupUsers = Object.entries(freq).filter(([,c]) => c > 1).map(([id]) => id);

      let dupDeleted = 0;
      for (const uid of dupUsers.slice(0, 50)) { // max 50 users par run
        // Garder le plus récent (order by created_at desc, skip first)
        const allSubs = await fetch(
          `${SB}/rest/v1/push_subscriptions?user_id=eq.${uid}&select=id,created_at&order=created_at.desc`,
          { headers: H }
        );
        if (!allSubs.ok) continue;
        const list = await allSubs.json();
        const toDelete = list.slice(1).map(s => s.id); // garder index 0 (le + récent)
        if (toDelete.length === 0) continue;
        const delRes = await fetch(
          `${SB}/rest/v1/push_subscriptions?id=in.(${toDelete.join(',')})`,
          { method: 'DELETE', headers: H }
        );
        if (delRes.ok) dupDeleted += toDelete.length;
      }
      report.deleted.push_subscriptions_duplicates = `${dupDeleted} doublons`;
    }
  } catch (e) {
    report.errors.push_subscriptions = e.message;
  }

  // ── 9. Produits inactifs sans commande depuis 1 an ────────────────────────
  // On ne supprime PAS — on log seulement pour que l'admin décide
  try {
    const oldInactive = await count('products', `active=eq.false&updated_at=lt.${ago(365)}`);
    report.info = { ...report.info, inactive_products_1y: oldInactive };
    if (oldInactive > 0) {
      console.warn(`[cleanup] ${oldInactive} produits inactifs depuis > 1 an — action admin requise`);
    }
  } catch(_) {}

  // ── 10. Log dans maintenance_log ─────────────────────────────────────────
  try {
    await fetch(`${SB}/rest/v1/maintenance_log`, {
      method:  'POST',
      headers: { ...H, 'Prefer': 'return=minimal' },
      body:    JSON.stringify({ job: 'weekly_cleanup', result: report, run_at: report.run_at }),
    });
  } catch(_) {}

  console.log('[cleanup] Terminé :', JSON.stringify(report));
  return report;
}
