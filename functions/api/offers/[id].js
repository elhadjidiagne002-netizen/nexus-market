import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    const offers = await sb.from('offers').select('*', `id=eq.${params.id}`);
    if (!offers?.length) return err('Offre introuvable', 404);
    const offer = offers[0];
    if (offer.vendor_id !== user.id && offer.buyer_id !== user.id && user.role !== 'admin') return err('Accès refusé', 403);
    const body = await request.json();
    const updated = await sb.from('offers').update(body, `id=eq.${params.id}`);
    // Notifier selon le statut
    const notifUser = offer.vendor_id === user.id ? offer.buyer_id : offer.vendor_id;
    const labels = { accepted: 'Offre acceptée', rejected: 'Offre refusée', countered: 'Contre-offre reçue' };
    if (body.status && labels[body.status]) {
      await sb.from('notifications').insert({
        user_id: notifUser, type: body.status === 'accepted' ? 'success' : 'info',
        title: labels[body.status], message: `Offre sur "${offer.product_name}"`,
      }).catch(() => {});
    }
    return json(Array.isArray(updated) ? updated[0] : updated);
  } catch (e) { return err(e.message, e.status || 500); }
}








