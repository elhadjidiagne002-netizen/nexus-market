/**
 * NEXUS Market — Cron : SOLLICITATION D'AVIS APRÈS LIVRAISON
 * ──────────────────────────────────────────────────────────────────────────
 * Repère les commandes livrées depuis 24h à 14 jours, jamais sollicitées, et
 * envoie une demande d'avis email + WhatsApp (événement `review_request`).
 *
 * Fenêtre 24h-14j : 24h laisse le temps de recevoir/essayer le produit (une
 * demande le jour même est prématurée et agace) ; au-delà de 14 jours le
 * souvenir s'estompe et le taux de réponse s'effondre — inutile d'insister.
 *
 * Anti-doublon à deux niveaux :
 *   1. `orders.review_requested_at` (sql/2026_08_22_orders_review_request.sql)
 *      → une seule sollicitation par commande.
 *   2. Vérification dans `reviews` (UNIQUE product_id+user_id) → on ne relance
 *      pas un acheteur qui a DÉJÀ laissé son avis spontanément.
 *
 * Le lien envoyé pointe vers la page produit SEO (/produit/:id) ; le formulaire
 * d'avis lui-même vit dans la SPA (« Mes commandes » → « Laisser un avis »),
 * rappelé en clair dans le message — il n'existe pas d'URL directe vers ce
 * formulaire aujourd'hui, donc on ne prétend pas le contraire.
 *
 * Déclencher par GET externe une fois par jour (voir .github/workflows/cron.yml) :
 *   GET https://nexusmarket.sn/cron/review-request?token=CRON_SECRET
 *
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET (ou NEXUS_WA_SECRET),
 *             + fournisseur WhatsApp (GREEN_API_… / WAHA_…) et/ou RESEND_API_KEY.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../api/_lib/utils.js';
import { sendEventNotification } from '../api/_lib/notify.js';

const jsonR = (d, s = 200) => new Response(JSON.stringify(d, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } });

const MIN_AGE_MS = 24 * 60 * 60 * 1000;       // 24h — laisse le temps d'essayer le produit
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;  // 14j — au-delà, taux de réponse trop faible
const MAX_BATCH = 20;                         // borne les sous-requêtes par exécution

export async function onRequestGet({ request, env }) {
  const token  = new URL(request.url).searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) return jsonR({ error: 'Non autorisé — ?token=requis' }, 401);
  return jsonR(await run(env));
}

export default { async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); } };

/** Premier article exploitable d'une commande (products est un jsonb array). */
function firstItem(products) {
  let arr = products;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { return null; } }
  if (!Array.isArray(arr) || !arr.length) return null;
  const it = arr[0];
  return {
    id: it.id || it.product_id || null,
    name: it.name || it.title || it.product_name || 'votre article',
  };
}

async function run(env) {
  const out = { run_at: new Date().toISOString(), candidates: 0, requested: 0, skipped_reviewed: 0, skipped_no_contact: 0, errors: [] };
  if (!env.SUPABASE_SERVICE_KEY) return { ...out, error: 'SUPABASE_SERVICE_KEY manquante' };

  const sb = supabase(env);
  const now = Date.now();
  const from = new Date(now - MAX_AGE_MS).toISOString();
  const to = new Date(now - MIN_AGE_MS).toISOString();

  let orders = [];
  try {
    orders = await sb.from('orders').select(
      'id,buyer_id,buyer_name,buyer_email,buyer_phone,products,delivered_at',
      `status=eq.delivered&delivered_at=gte.${from}&delivered_at=lte.${to}&review_requested_at=is.null&limit=${MAX_BATCH}`
    );
  } catch (e) { return { ...out, error: 'Lecture orders: ' + e.message }; }
  if (!Array.isArray(orders) || !orders.length) return out;
  out.candidates = orders.length;

  const origin = env.SITE_URL || env.FRONTEND_URL || 'https://nexusmarket.sn';
  const stamp = () => new Date().toISOString();

  for (const o of orders) {
    try {
      if (!o.buyer_email && !o.buyer_phone) {
        out.skipped_no_contact++;
        // Rien d'envoyable : on marque pour ne pas réévaluer chaque jour.
        await sb.from('orders').update({ review_requested_at: stamp() }, `id=eq.${encodeURIComponent(o.id)}`);
        continue;
      }

      const item = firstItem(o.products);

      // Avis déjà laissé spontanément pour ce produit par cet acheteur ?
      if (item && item.id && o.buyer_id) {
        const existing = await sb.from('reviews').select(
          'id',
          `product_id=eq.${encodeURIComponent(item.id)}&user_id=eq.${encodeURIComponent(o.buyer_id)}&limit=1`
        );
        if (Array.isArray(existing) && existing.length) {
          out.skipped_reviewed++;
          await sb.from('orders').update({ review_requested_at: stamp() }, `id=eq.${encodeURIComponent(o.id)}`);
          continue;
        }
      }

      await sendEventNotification(env, 'review_request',
        { email: o.buyer_email || null, phone: o.buyer_phone || null, userId: o.buyer_id || null },
        {
          buyer_name: o.buyer_name || 'cher client',
          order_id: String(o.id).slice(0, 8),
          product_name: item ? item.name : 'votre commande',
          product_url: item && item.id ? `${origin}/produit/${item.id}` : '',
          site_url: origin,
          _userId: o.buyer_id || null,
          _orderId: o.id,
        }
      );

      // Best-effort : marqué même si l'envoi échoue (notification_outbox gère le
      // retry des échecs réels) — évite de re-solliciter à chaque exécution.
      await sb.from('orders').update({ review_requested_at: stamp() }, `id=eq.${encodeURIComponent(o.id)}`);
      out.requested++;
    } catch (e) {
      out.errors.push(`order ${o.id}: ${e.message}`);
    }
  }

  console.log('[review-request]', JSON.stringify(out));
  return out;
}
