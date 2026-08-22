// functions/cron/abandoned-cart.js → GET /cron/abandoned-cart?token=...
// Relance WhatsApp (+ email) les paniers laissés en plan. À déclencher toutes
// les heures depuis cron-job.org, comme les autres /cron/* :
//   GET https://nexusmarket.sn/cron/abandoned-cart?token=VOTRE_CRON_SECRET
//
// Garde-fous (dans l'ordre d'application) :
//   1. panier non vide ET inactif depuis >= MIN_IDLE_HOURS (sinon on relance
//      quelqu'un encore en train de faire ses courses) ;
//   2. panier pas trop vieux (> MAX_IDLE_DAYS = abandon définitif, on lâche
//      l'affaire plutôt que de réveiller un compte dormant) ;
//   3. AUCUNE commande créée depuis la dernière modif du panier (sinon on
//      relancerait quelqu'un qui a déjà acheté — `carts` n'est pas toujours
//      vidé après commande) ;
//   4. cette VERSION du panier (carts.updated_at) n'a jamais été relancée
//      (table abandoned_cart_reminders) ;
//   5. plafond MAX_REMINDERS_PER_CART relances cumulées par utilisateur.
// Sans ces garde-fous, un cron horaire renvoie le même message toutes les
// heures au même client tant qu'il ne touche pas son panier.
import { supabase } from '../api/_lib/utils.js';
import { sendEventNotification } from '../api/_lib/notify.js';

const MIN_IDLE_HOURS = 4;        // laisser le temps de finir sa session d'achat
const MAX_IDLE_DAYS = 14;        // au-delà : abandon définitif, on ne relance plus
const MAX_REMINDERS_PER_CART = 2;// plafond de relances cumulées par utilisateur
const BATCH_LIMIT = 40;          // bornes les sous-requêtes Workers par invocation

const json = (o, status = 200) =>
  new Response(JSON.stringify(o, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) {
    return json({ error: 'Non autorisé — ?token=requis' }, 401);
  }
  return json(await runAbandonedCart(env));
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runAbandonedCart(env)); },
};

async function runAbandonedCart(env) {
  const sb = supabase(env);
  const now = Date.now();
  const idleBefore = new Date(now - MIN_IDLE_HOURS * 3600e3).toISOString();
  const tooOldBefore = new Date(now - MAX_IDLE_DAYS * 86400e3).toISOString();
  const siteUrl = env.SITE_URL || 'https://nexusmarket.sn';

  let carts = [];
  try {
    carts = await sb.from('carts').select(
      'user_id,items,updated_at',
      `updated_at=lt.${idleBefore}&updated_at=gt.${tooOldBefore}&order=updated_at.desc&limit=${BATCH_LIMIT}`
    );
    if (!Array.isArray(carts)) carts = [];
  } catch (e) {
    return { error: 'lecture carts: ' + e.message };
  }

  const stats = { scanned: carts.length, sent: 0, skipped_empty: 0, skipped_ordered: 0, skipped_already: 0, skipped_no_contact: 0, errors: 0 };

  for (const cart of carts) {
    const items = Array.isArray(cart.items) ? cart.items : [];
    if (!items.length) { stats.skipped_empty++; continue; }

    try {
      // Garde-fou 4/5 : cette version du panier a-t-elle déjà été relancée ?
      const prior = await sb.from('abandoned_cart_reminders').select(
        'cart_updated_at,reminder_count',
        `user_id=eq.${encodeURIComponent(cart.user_id)}`
      );
      const priorRow = Array.isArray(prior) && prior[0];
      if (priorRow) {
        if (priorRow.cart_updated_at === cart.updated_at) { stats.skipped_already++; continue; }
        if ((priorRow.reminder_count || 0) >= MAX_REMINDERS_PER_CART) { stats.skipped_already++; continue; }
      }

      // Garde-fou 3 : commande passée depuis la dernière modif du panier ?
      const orders = await sb.from('orders').select(
        'id',
        `buyer_id=eq.${encodeURIComponent(cart.user_id)}&created_at=gt.${encodeURIComponent(cart.updated_at)}&limit=1`
      );
      if (Array.isArray(orders) && orders.length) { stats.skipped_ordered++; continue; }

      const profiles = await sb.from('profiles').select(
        'phone,email,name',
        `id=eq.${encodeURIComponent(cart.user_id)}`
      );
      const profile = (Array.isArray(profiles) && profiles[0]) || {};
      if (!profile.phone && !profile.email) { stats.skipped_no_contact++; continue; }

      const names = items.map(i => i && i.name).filter(Boolean);
      const vars = {
        buyer_name: profile.name || 'cher client',
        item_count: items.reduce((n, i) => n + (Number(i && i.quantity) || 1), 0),
        items_summary: names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : ''),
        site_url: siteUrl,
      };

      await sendEventNotification(env, 'abandoned_cart',
        { userId: cart.user_id, phone: profile.phone, email: profile.email }, vars);

      await sb.from('abandoned_cart_reminders').upsert([{
        user_id: cart.user_id,
        cart_updated_at: cart.updated_at,
        reminded_at: new Date().toISOString(),
        reminder_count: ((priorRow && priorRow.reminder_count) || 0) + 1,
      }], 'user_id');

      stats.sent++;
    } catch (e) {
      stats.errors++;
      console.warn('[abandoned-cart]', cart.user_id, e.message);
    }
  }

  return { ok: true, ...stats, at: new Date().toISOString() };
}
