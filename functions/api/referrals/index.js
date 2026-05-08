import { CORS, options, json, err, supabase, requireAuth } from '../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (request.method === 'GET') {
      const data = await sb.from('referrals').select('*', `referrer_id=eq.${user.id}&order=created_at.desc`);
      return json(data || []);
    }
    if (request.method === 'POST') {
      const { referralCode, referredEmail } = await request.json();
      if (!referralCode) return err('Code requis', 400);
      // Trouver le parrain
      const refs = await sb.from('referrals').select('referrer_id', `code=eq.${referralCode}`);
      if (!refs?.length) return err('Code de parrainage invalide', 404);
      const referrerId = refs[0].referrer_id;
      if (referrerId === user.id) return err('Auto-parrainage interdit', 400);
      // Créer le parrainage et créditer
      await sb.from('referrals').insert({ referrer_id: referrerId, referred_id: user.id, referred_email: referredEmail || user.email, code: referralCode, rewarded: false });
      await sb.rpc('add_loyalty_points', { p_user_id: referrerId, p_delta: 500, p_reason: 'referral', p_note: `Parrainage de ${user.email}` }).catch(() => {});
      await sb.from('referrals').update({ rewarded: true, rewarded_at: new Date().toISOString() }, `code=eq.${referralCode}&rewarded=eq.false`);
      return json({ success: true });
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}











