import { CORS, options, json, err, supabase, requireAuth } from '../../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (!['vendor','admin'].includes(user.role)) return err('Réservé aux vendeurs', 403);
    const sb = supabase(env);
    // Calcul : somme des commandes livrées - commission - retraits déjà payés
    const orders = await sb.from('orders').select('total,commission', `vendor_id=eq.${user.id}&status=eq.delivered`);
    const payouts = await sb.from('payout_requests').select('amount', `vendor_id=eq.${user.id}&status=in.(paid,processing)`);
    const earned = (orders || []).reduce((s, o) => s + (o.total - (o.commission || 0)), 0);
    const withdrawn = (payouts || []).reduce((s, p) => s + (p.amount || 0), 0);
    const available = Math.max(0, earned - withdrawn);
    return json({ earned, withdrawn, available, currency: 'EUR' });
  } catch (e) { return err(e.message, 500); }
}
