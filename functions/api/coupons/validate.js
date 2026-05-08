import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const { code, total } = await request.json();
    if (!code) return err('Code requis', 400);
    const sb = supabase(env);
    const coupons = await sb.from('coupons').select('*', `code=eq.${code.toUpperCase()}&active=eq.true`);
    if (!coupons?.length) return err('Code invalide ou expiré', 404);
    const coupon = coupons[0];
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return err('Code expiré', 400);
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return err('Code épuisé', 400);
    const discount = Math.round((total || 0) * coupon.discount / 100);
    return json({ valid: true, discount: coupon.discount, amount: discount, coupon });
  } catch (e) { return err(e.message, 500); }
}



