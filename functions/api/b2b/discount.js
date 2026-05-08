import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (user.role !== 'buyer_pro') return err('Réservé aux acheteurs professionnels', 403);
    const { total } = await request.json();
    // Remise B2B progressive
    const discount = total >= 10000 ? 0.15 : total >= 5000 ? 0.10 : total >= 1000 ? 0.05 : 0;
    return json({ discount, discountPct: Math.round(discount * 100), amount: Math.round(total * discount * 100) / 100 });
  } catch (e) { return err(e.message, 500); }
}


