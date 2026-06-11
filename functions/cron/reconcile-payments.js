/**
 * NEXUS Market — Cron : RÉCONCILIATION DES PAIEMENTS STRIPE
 * ──────────────────────────────────────────────────────────────────────────
 * Filet de sécurité quand le webhook Stripe n'a pas marqué une commande payée
 * (mauvaise config, perte réseau…). Interroge l'API Stripe pour chaque commande
 * carte restée en attente et la marque 'paid' SI ET SEULEMENT SI le PaymentIntent
 * est réellement 'succeeded' (vérification de confiance — pas le retour navigateur).
 *
 * ⚠️ PayTech (mobile money) : pas d'API de vérification simple → la confirmation
 * passe par l'IPN (/api/payments/paytech/ipn). Vérifier que l'ipn_url est bien
 * configurée côté PayTech. Le trigger SQL « livré ⇒ payé » couvre le reste.
 *
 * Déclencher par GET externe toutes les 5–15 min :
 *   GET https://nexus-market-asb.pages.dev/cron/reconcile-payments?token=CRON_SECRET
 *
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY,
 *             CRON_SECRET (ou NEXUS_WA_SECRET).
 * ──────────────────────────────────────────────────────────────────────────
 */

const jsonR = (d, s = 200) => new Response(JSON.stringify(d, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } });

export async function onRequestGet({ request, env }) {
  const token  = new URL(request.url).searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) return jsonR({ error: 'Non autorisé — ?token=requis' }, 401);
  return jsonR(await reconcile(env, request));
}

export default { async scheduled(event, env, ctx) { ctx.waitUntil(reconcile(env, null)); } };

async function reconcile(env, request) {
  const SB = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY;
  const out = { run_at: new Date().toISOString(), checked: 0, paid: 0, failed: 0, skipped: 0, errors: [] };
  if (!KEY) return { ...out, error: 'SUPABASE_SERVICE_KEY manquante' };
  if (!env.STRIPE_SECRET_KEY) return { ...out, error: 'STRIPE_SECRET_KEY manquante (réconciliation Stripe désactivée)' };

  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  const since = new Date(Date.now() - 14 * 86400000).toISOString();

  // Commandes carte en attente, avec un PaymentIntent, créées récemment.
  let orders = [];
  try {
    const q = `${SB}/rest/v1/orders?select=id,stripe_payment_id,status,payment_status,total`
      + `&payment_status=eq.pending&stripe_payment_id=not.is.null`
      + `&status=in.(pending_payment,processing)&created_at=gte.${since}&limit=50`;
    const r = await fetch(q, { headers: H });
    orders = r.ok ? await r.json() : [];
  } catch (e) { return { ...out, error: 'Lecture orders: ' + e.message }; }

  for (const o of orders) {
    const pi = o.stripe_payment_id;
    if (!pi || !/^pi_/.test(pi)) { out.skipped++; continue; }
    out.checked++;
    try {
      const sr = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      if (!sr.ok) { out.skipped++; continue; }
      const intent = await sr.json();
      let patch = null;
      if (intent.status === 'succeeded') {
        patch = { payment_status: 'paid', status: o.status === 'pending_payment' ? 'processing' : o.status, processing_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      } else if (intent.status === 'canceled') {
        patch = { payment_status: 'failed', updated_at: new Date().toISOString() };
      }
      if (!patch) { out.skipped++; continue; }
      const up = await fetch(`${SB}/rest/v1/orders?id=eq.${encodeURIComponent(o.id)}`, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
      });
      if (up.ok) { patch.payment_status === 'paid' ? out.paid++ : out.failed++; }
      else out.errors.push(`order ${o.id}: HTTP ${up.status}`);
    } catch (e) { out.errors.push(`order ${o.id}: ${e.message}`); }
  }

  console.log('[reconcile-payments]', JSON.stringify(out));
  return out;
}
