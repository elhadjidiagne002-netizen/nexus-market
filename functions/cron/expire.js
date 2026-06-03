/**
 * NEXUS Market — Cloudflare Cron Trigger : expiration boosts & annonces
 * ──────────────────────────────────────────────────────────────────────────
 * GRATUIT — fonctionne sur le plan Free de Cloudflare Workers (100k req/jour)
 * Alternative à pg_cron (qui nécessite Supabase Pro)
 *
 * DÉPLOIEMENT :
 * 1. Placer ce fichier dans /functions/cron/expire.js du repo
 * 2. Ajouter dans wrangler.toml (ou créer ce fichier à la racine) :
 *
 *    [triggers]
 *    crons = ["0 * * * *"]   # toutes les heures
 *
 * 3. Variables d'environnement Cloudflare (Settings → Variables) :
 *    SUPABASE_URL          = https://pqcqbstbdujzaclsiosv.supabase.co
 *    SUPABASE_SERVICE_KEY  = eyJ...  (clé service_role, PAS anon)
 *
 * 4. Déployer : git push → Cloudflare rebuild automatique
 *
 * La clé service_role se trouve dans :
 * Supabase Dashboard → Settings → API → service_role (secret)
 * ⚠️  Ne jamais exposer cette clé côté client
 * ──────────────────────────────────────────────────────────────────────────
 */

// Point d'entrée du Cron Trigger Cloudflare
export default {

  // Déclenché par le cron schedule (wrangler.toml)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMaintenance(env));
  },

  // Aussi accessible en GET pour test manuel :
  // https://nexus-market-asb.pages.dev/cron/expire
  async fetch(request, env) {
    // Sécuriser l'appel manuel avec un token
    const url    = new URL(request.url);
    const token  = url.searchParams.get('token');
    const secret = env.NEXUS_WA_SECRET || 'nexus-wa-2026';

    if (token !== secret) {
      return new Response(JSON.stringify({ error: 'Non autorisé — ajouter ?token=votre_secret' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await runMaintenance(env);
    return new Response(JSON.stringify(result, null, 2), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
};

// ── Route HTTP Pages Function (export NOMMÉ) ─────────────────────────────
// Cloudflare Pages n'invoque QUE les exports nommés onRequest*. Le bloc
// `export default { fetch, scheduled }` ci-dessus est ignoré dans /functions
// → sans ce handler, GET /cron/expire ne déclenchait jamais la maintenance.
export async function onRequestGet({ request, env }) {
  const token  = new URL(request.url).searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) {
    return new Response(JSON.stringify({ error: 'Non autorisé — ?token=requis' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  const result = await runMaintenance(env);
  return new Response(JSON.stringify(result, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

// ── Fonction principale de maintenance ──────────────────────────────────
async function runMaintenance(env) {
  const SUPABASE_URL = env.SUPABASE_URL || 'https://pqcqbstbdujzaclsiosv.supabase.co';
  const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;

  if (!SERVICE_KEY) {
    console.error('[Cron] SUPABASE_SERVICE_KEY manquante');
    return { error: 'SUPABASE_SERVICE_KEY non configurée' };
  }

  const headers = {
    'Content-Type':  'application/json',
    'apikey':        SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Prefer':        'return=representation',
  };

  const results = { run_at: new Date().toISOString() };

  // ── 1. Expirer les annonces Express dépassées ──────────────────────────
  try {
    const now = new Date().toISOString();

    // PATCH : passer status='expired' pour les annonces dont expires_at < now
    const expireAnnonces = await fetch(
      `${SUPABASE_URL}/rest/v1/annonces_express?status=eq.active&expires_at=lt.${now}`,
      {
        method:  'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body:    JSON.stringify({ status: 'expired' }),
      }
    );

    // Supprimer les annonces expirées depuis plus de 90 jours
    const cutoff90 = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const deleteOld = await fetch(
      `${SUPABASE_URL}/rest/v1/annonces_express?status=eq.expired&expires_at=lt.${cutoff90}`,
      { method: 'DELETE', headers }
    );

    results.annonces = {
      expired: expireAnnonces.ok ? 'OK' : `Erreur ${expireAnnonces.status}`,
      deleted_old: deleteOld.ok ? 'OK' : `Erreur ${deleteOld.status}`,
    };
  } catch (e) {
    results.annonces = { error: e.message };
  }

  // ── 2. Expirer les Boosts dépassés ─────────────────────────────────────
  try {
    const now = new Date().toISOString();

    // Récupérer les boosts actifs expirés
    const expiredBoostsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/product_boosts?active=eq.true&payment_status=eq.paid&ends_at=lt.${now}&select=id,product_id`,
      { method: 'GET', headers }
    );
    const expiredBoosts = expiredBoostsRes.ok ? await expiredBoostsRes.json() : [];

    if (expiredBoosts.length > 0) {
      // Désactiver tous les boosts expirés d'un coup
      const disableRes = await fetch(
        `${SUPABASE_URL}/rest/v1/product_boosts?active=eq.true&payment_status=eq.paid&ends_at=lt.${now}`,
        {
          method:  'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body:    JSON.stringify({ active: false }),
        }
      );

      // Pour chaque produit concerné, vérifier s'il a encore un boost actif
      const productIds = [...new Set(expiredBoosts.map(b => b.product_id))];

      for (const productId of productIds) {
        // Vérifier boost encore actif
        const stillBoostRes = await fetch(
          `${SUPABASE_URL}/rest/v1/product_boosts?product_id=eq.${productId}&active=eq.true&payment_status=eq.paid&ends_at=gt.${now}&select=id&limit=1`,
          { method: 'GET', headers }
        );
        const stillBoosted = stillBoostRes.ok ? await stillBoostRes.json() : [];

        if (stillBoosted.length === 0) {
          // Plus de boost actif → retirer le badge
          await fetch(
            `${SUPABASE_URL}/rest/v1/products?id=eq.${productId}`,
            {
              method:  'PATCH',
              headers: { ...headers, 'Prefer': 'return=minimal' },
              body:    JSON.stringify({ is_boosted: false, boost_ends_at: null }),
            }
          );
        }
      }

      results.boosts = {
        expired: expiredBoosts.length,
        products_updated: productIds.length,
        status: disableRes.ok ? 'OK' : `Erreur ${disableRes.status}`,
      };
    } else {
      results.boosts = { expired: 0, message: 'Aucun boost expiré' };
    }
  } catch (e) {
    results.boosts = { error: e.message };
  }

  // ── 3. Log dans maintenance_log ────────────────────────────────────────
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/maintenance_log`, {
      method:  'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body:    JSON.stringify({
        job:    'cloudflare_cron',
        result: results,
        run_at: results.run_at,
      }),
    });
  } catch(_) {} // silencieux si table absente

  console.log('[Cron] Maintenance terminée :', JSON.stringify(results));
  return results;
}
