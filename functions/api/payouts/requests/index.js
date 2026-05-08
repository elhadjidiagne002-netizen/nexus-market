import { CORS, options, json, err, supabase, requireAuth, requireAdmin } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (request.method === 'GET') {
      const qs = user.role === 'admin' ? 'order=created_at.desc' : `vendor_id=eq.${user.id}&order=created_at.desc`;
      return json(await sb.from('payout_requests').select('*', qs) || []);
    }
    if (request.method === 'POST') {
      if (!['vendor'].includes(user.role)) return err('Réservé aux vendeurs', 403);
      const { amount, method, provider, destination } = await request.json();
      if (!amount || amount < 10) return err('Montant minimum 10 EUR', 400);
      const data = await sb.from('payout_requests').insert({
        vendor_id: user.id, vendor_name: user.name, amount, method, provider, destination, status: 'pending',
      });
      return json(Array.isArray(data) ? data[0] : data, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}



