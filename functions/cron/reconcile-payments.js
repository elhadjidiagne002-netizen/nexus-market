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

import { logPaymentEvent } from '../api/_lib/payment-log.js';
import { sendEmail } from '../api/_lib/utils.js';

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
      if (up.ok) {
        const paid = patch.payment_status === 'paid';
        paid ? out.paid++ : out.failed++;
        // Écart détecté : le webhook Stripe avait manqué cette transition → audit.
        await logPaymentEvent(env, {
          provider: 'reconcile',
          event_type: paid ? 'reconciled_paid' : 'reconciled_failed',
          order_id: o.id, ref: pi, amount: o.total != null ? Number(o.total) : null, currency: 'EUR',
          status: patch.payment_status,
          note: 'Rattrapé par le cron de réconciliation (webhook Stripe manqué)',
        });
      }
      else out.errors.push(`order ${o.id}: HTTP ${up.status}`);
    } catch (e) { out.errors.push(`order ${o.id}: ${e.message}`); }
  }

  console.log('[reconcile-payments]', JSON.stringify(out));

  // [ALERTE OPS] Écart détecté (paiement rattrapé = webhook Stripe manqué) ou erreurs
  // → alerter l'admin par email. Best-effort : gate = ADMIN_EMAIL + clé email présents ;
  // n'interrompt jamais la réconciliation.
  if ((out.paid > 0 || out.failed > 0 || out.errors.length > 0) && env.ADMIN_EMAIL) {
    try {
      const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      await sendEmail(env, {
        to: env.ADMIN_EMAIL,
        subject: `⚠️ NEXUS — réconciliation paiement : ${out.paid} rattrapé(s), ${out.errors.length} erreur(s)`,
        html: `<h2>Réconciliation paiement Stripe</h2>`
          + `<p>Le cron a détecté des écarts — un webhook Stripe a probablement échoué (paiement encaissé mais commande non marquée payée).</p>`
          + `<ul><li>Commandes vérifiées : ${out.checked}</li>`
          + `<li><b>Rattrapées « payées » : ${out.paid}</b></li>`
          + `<li>Marquées « échouées » : ${out.failed}</li>`
          + `<li>Erreurs : ${out.errors.length}</li></ul>`
          + (out.errors.length ? `<pre>${esc(out.errors.slice(0, 10).join('\n'))}</pre>` : '')
          + `<p>Action recommandée : vérifier la config du webhook Stripe (/api/webhooks/stripe) et l'IPN.</p>`
          + `<p style="color:#888;font-size:12px">${esc(out.run_at)}</p>`,
      });
    } catch (e) { console.warn('[reconcile-payments] alerte admin KO:', e.message); }
  }

  return out;
}
