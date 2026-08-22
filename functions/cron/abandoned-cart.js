/**
 * NEXUS Market — Cron : RELANCE PANIER ABANDONNÉ
 * ──────────────────────────────────────────────────────────────────────────
 * Repère les paniers (table `carts`) laissés inactifs 2h à 48h, sans commande
 * récente correspondante, et envoie une relance email + WhatsApp (événement
 * `abandoned_cart`, déjà défini dans functions/api/_lib/notify.js).
 *
 * Fenêtre 2h-48h : assez de délai pour ne pas relancer un achat en cours
 * (autre onglet, hésitation courte), assez tôt pour rester pertinent —
 * au-delà de 48h on abandonne (le stock/prix a pu changer, la fenêtre
 * d'action est passée).
 *
 * `reminder_sent_at` (colonne ajoutée par sql/2026_08_22_carts_abandon_reminder.sql)
 * évite les relances en double : une seule relance par « épisode » d'abandon.
 * Si le client revient plus tard et remplit un nouveau panier après achat,
 * `reminder_sent_at` doit être réinitialisée manuellement en base ou par le
 * flux de checkout — non fait ici pour rester simple (v1).
 *
 * Déclencher par GET externe toutes les heures (voir .github/workflows/cron.yml) :
 *   GET https://nexusmarket.sn/cron/abandoned-cart?token=CRON_SECRET
 *
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET (ou NEXUS_WA_SECRET),
 *             + fournisseur WhatsApp (GREEN_API_… / WAHA_…) et/ou RESEND_API_KEY/BREVO_API_KEY.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../api/_lib/utils.js';
import { sendEventNotification } from '../api/_lib/notify.js';

const jsonR = (d, s = 200) => new Response(JSON.stringify(d, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } });

const MIN_IDLE_MS = 2 * 60 * 60 * 1000;   // 2h — laisse le temps à un achat en cours
const MAX_IDLE_MS = 48 * 60 * 60 * 1000;  // 48h — au-delà, trop tard pour être pertinent
const MAX_BATCH = 20;                     // borne le nombre de sous-requêtes par exécution

export async function onRequestGet({ request, env }) {
  const token  = new URL(request.url).searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) return jsonR({ error: 'Non autorisé — ?token=requis' }, 401);
  return jsonR(await run(env));
}

export default { async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); } };

async function run(env) {
  const out = { run_at: new Date().toISOString(), candidates: 0, reminded: 0, skipped_ordered: 0, skipped_no_phone: 0, errors: [] };
  if (!env.SUPABASE_SERVICE_KEY) return { ...out, error: 'SUPABASE_SERVICE_KEY manquante' };

  const sb = supabase(env);
  const now = Date.now();
  const from = new Date(now - MAX_IDLE_MS).toISOString();
  const to = new Date(now - MIN_IDLE_MS).toISOString();

  // Paniers inactifs depuis 2-48h, jamais relancés (filtre "non vide" fait en JS
  // ci-dessous — la syntaxe de filtre PostgREST sur jsonb=[] n'est pas fiable).
  let carts = [];
  try {
    carts = await sb.from('carts').select(
      'user_id,items,updated_at',
      `updated_at=gte.${from}&updated_at=lte.${to}&reminder_sent_at=is.null&limit=${MAX_BATCH}`
    );
  } catch (e) { return { ...out, error: 'Lecture carts: ' + e.message }; }
  carts = (Array.isArray(carts) ? carts : []).filter((c) => Array.isArray(c.items) && c.items.length > 0);
  if (!carts.length) return out;
  out.candidates = carts.length;

  const origin = env.SITE_URL || env.FRONTEND_URL || 'https://nexusmarket.sn';

  for (const cart of carts) {
    try {
      // Achat déjà passé depuis l'abandon (tolérance 10 min pour un checkout concurrent) ?
      const since = new Date(new Date(cart.updated_at).getTime() - 10 * 60 * 1000).toISOString();
      const recentOrders = await sb.from('orders').select('id', `buyer_id=eq.${encodeURIComponent(cart.user_id)}&created_at=gte.${since}&limit=1`);
      if (Array.isArray(recentOrders) && recentOrders.length) {
        out.skipped_ordered++;
        // Marque quand même comme « traité » pour ne pas le réévaluer à chaque run.
        await sb.from('carts').update({ reminder_sent_at: new Date().toISOString() }, `user_id=eq.${encodeURIComponent(cart.user_id)}`);
        continue;
      }

      const profileRows = await sb.from('profiles').select('phone,name,email', `id=eq.${encodeURIComponent(cart.user_id)}`);
      const profile = Array.isArray(profileRows) && profileRows[0];
      if (!profile || !profile.phone) { out.skipped_no_phone++; continue; }

      const items = Array.isArray(cart.items) ? cart.items : [];
      const itemCount = items.reduce((n, it) => n + (Number(it.quantity) || 1), 0);
      const itemsSummary = items.slice(0, 3).map((it) => it.name).filter(Boolean).join(', ') + (items.length > 3 ? '…' : '');

      await sendEventNotification(env, 'abandoned_cart', { phone: profile.phone, email: profile.email, userId: cart.user_id }, {
        buyer_name: profile.name || 'cher client',
        item_count: itemCount,
        items_summary: itemsSummary,
        site_url: origin,
      });

      // Best-effort : on marque relancé même si les deux canaux échouent, pour ne pas
      // marteler un profil dont le téléphone/email pose problème à chaque run horaire
      // (sendEventNotification retente déjà les échecs réels via notification_outbox).
      await sb.from('carts').update({ reminder_sent_at: new Date().toISOString() }, `user_id=eq.${encodeURIComponent(cart.user_id)}`);
      out.reminded++;
    } catch (e) {
      out.errors.push(`user ${cart.user_id}: ${e.message}`);
    }
  }

  console.log('[abandoned-cart]', JSON.stringify(out));
  return out;
}
