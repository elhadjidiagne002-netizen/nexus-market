// functions/api/courier/notify-assignment.js
// POST /api/courier/notify-assignment  { delivery_id }
//
// Envoie le PUSH au coursier qui vient d'être attribué DIRECTEMENT à la création
// d'une course (create_delivery assigne tout de suite → la course ne passe pas
// par le cron, donc le push doit être déclenché ici). Le navigateur de
// l'acheteur ne peut pas pousser un autre utilisateur (sécurité #6) ; cet
// endpoint le fait CÔTÉ SERVEUR : contenu 100 % templé, cible = le coursier
// réellement assigné à la course (jamais choisi par l'appelant).
//
// Auth : JWT Supabase (l'acheteur de la course, ou admin). Best-effort.
import { options, json, err, requireAuth, requireAdmin, supabase, internalSecret } from '../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  const [user, authErr] = await requireAuth(request, env);
  if (authErr) return authErr;

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const deliveryId = body.delivery_id;
  if (!deliveryId) return err('delivery_id requis', 400);

  let d;
  try {
    const sb = supabase(env);
    const rows = await sb.from('deliveries').select(
      'id,buyer_id,courier_id,status,pickup_label,dropoff_label,courier_payout',
      `id=eq.${encodeURIComponent(deliveryId)}`
    );
    d = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    return err('Lecture course impossible', 502);
  }
  if (!d) return err('Course introuvable', 404);

  // Appartenance : l'acheteur de la course (ou un admin) uniquement.
  if (d.buyer_id && d.buyer_id !== user.id) {
    const [, adminErr] = await requireAdmin(request, env);
    if (adminErr) return err('Non autorisé', 403);
  }
  if (!d.courier_id) return json({ ok: true, skipped: 'no_courier' });

  // Push au coursier assigné (serveur→serveur vers /push-send, secret interne).
  const origin = new URL(request.url).origin;
  const payout = d.courier_payout != null
    ? ' · ' + Number(d.courier_payout).toLocaleString('fr-FR') + ' FCFA' : '';
  let ok = false;
  try {
    const r = await fetch(`${origin}/push-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': internalSecret(env) },
      body: JSON.stringify({
        userId: d.courier_id,
        title: '🛵 Une course vous a été attribuée !',
        body: (d.pickup_label || 'Retrait') + ' → ' + (d.dropoff_label || 'Livraison') + payout,
        url: '/',
      }),
    });
    ok = !!(r && r.ok);
  } catch (_) { /* best-effort */ }

  return json({ ok });
}
