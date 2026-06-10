// functions/api/wa-tracking.js → /api/wa-tracking
// [REVENU PASSIF #15] Envoie une alerte WhatsApp de suivi de commande à l'acheteur,
// UNIQUEMENT si la commande a souscrit l'option « Suivi Premium WhatsApp »
// (orders.wa_tracking = true). Réutilise l'infrastructure Green API existante via
// la fonction interne /api/whatsapp (pas de duplication des secrets).
//
//   POST /api/wa-tracking  { orderId, status }
//   → { sent: boolean, reason?: string }
//
// À appeler depuis le flux de changement de statut (vendeur/admin/livreur) après
// updateOrderStatus. Idempotent : ne renvoie pas deux fois le même statut
// (colonne wa_tracking_last, cf. migration 2026_06_07_wa_tracking.sql).
import { json, err, corsOptions } from './_lib/response.js';

const MESSAGES = {
  processing:  (o) => `🛒 NEXUS — Commande ${o.id} confirmée par le vendeur. Préparation en cours.`,
  in_transit:  (o) => `🚚 NEXUS — Votre commande ${o.id} est en route ! Suivez la livraison sur la plateforme.`,
  delivered:   (o) => `✅ NEXUS — Commande ${o.id} livrée. Merci pour votre confiance ! Laissez un avis sur la plateforme.`,
  cancelled:   (o) => `❌ NEXUS — Commande ${o.id} annulée. En cas de paiement, le remboursement est en cours.`,
};

async function sb(env, path, init = {}) {
  const key = env.SUPABASE_SERVICE_KEY;
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return corsOptions();
  if (request.method !== 'POST') return err('POST uniquement', 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return err('Configuration Supabase incomplète', 503);

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const { orderId, status } = body || {};
  if (!orderId || !status) return err('orderId et status requis', 400);
  if (!MESSAGES[status]) return json({ sent: false, reason: 'statut_non_notifiable' });

  // Charger la commande (option + téléphone acheteur + anti-doublon).
  let order;
  try {
    const r = await sb(env, `orders?select=id,buyer_phone,buyer_name,wa_tracking,wa_tracking_last&id=eq.${encodeURIComponent(orderId)}&limit=1`);
    const rows = await r.json();
    order = Array.isArray(rows) ? rows[0] : null;
  } catch (e) { return err('Lecture commande échouée', 500); }
  if (!order) return err('Commande introuvable', 404);

  if (!order.wa_tracking) return json({ sent: false, reason: 'option_non_souscrite' });
  if (order.wa_tracking_last === status) return json({ sent: false, reason: 'deja_notifie' });
  const phone = order.buyer_phone;
  if (!phone) return json({ sent: false, reason: 'telephone_manquant' });

  // Envoi via la fonction interne /api/whatsapp (Green API).
  const origin = env.SITE_URL || new URL(request.url).origin;
  let sent = false;
  try {
    const wr = await fetch(`${origin}/api/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': env.INTERNAL_API_SECRET || env.CRON_SECRET || env.SUPABASE_SERVICE_KEY || '' },
      body: JSON.stringify({ to: phone, phone, message: MESSAGES[status](order), template: 'order_tracking' }),
    });
    sent = wr.ok;
  } catch (_) { sent = false; }

  // Mémoriser le dernier statut notifié (anti-doublon), best-effort.
  if (sent) {
    try {
      await sb(env, `orders?id=eq.${encodeURIComponent(orderId)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ wa_tracking_last: status }),
      });
    } catch (_) {}
  }

  return json({ sent, reason: sent ? undefined : 'envoi_whatsapp_echoue' });
}
