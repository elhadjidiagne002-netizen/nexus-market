// functions/api/loyalty/index.js
// GET  /api/loyalty            -> solde + tier + historique
// POST /api/loyalty/earn       -> crediter (interne)
// POST /api/loyalty/redeem     -> echanger des points
// GET  /api/loyalty/rewards    -> catalogue recompenses
// POST /api/loyalty/check      -> calculer remise avant achat
import { adminClient, requireAuth, handle, ok, err } from '../../_lib/supabase.js';

const POINTS_PER_100 = 1;
const POINT_FCFA     = 5;
const MIN_REDEEM     = 100;

const TIERS = [
  { name:'Bronze',  icon:'medal-bronze', min:0,     mult:1.0, perks:['1 pt/100 FCFA','Flash 1h avant'] },
  { name:'Argent',  icon:'medal',        min:1000,  mult:1.5, perks:['1.5 pt/100 FCFA','Livraison offerte 10k+'] },
  { name:'Or',      icon:'star',         min:5000,  mult:2.0, perks:['2 pts/100 FCFA','Livraison offerte 5k+','Support prioritaire'] },
  { name:'Platine', icon:'diamond',      min:15000, mult:3.0, perks:['3 pts/100 FCFA','Livraison toujours gratuite','Gestionnaire dedié'] },
];

function getTier(total) {
  const t = [...TIERS].reverse().find(t => total >= t.min) || TIERS[0];
  const idx = TIERS.indexOf(t);
  const next = TIERS[idx+1] || null;
  return { ...t, progress_pct: next ? Math.min(100, Math.round(((total-t.min)/(next.min-t.min))*100)) : 100, next_tier: next ? { name:next.name, points_needed: next.min-total } : null };
}

export const onRequest = handle(async ({ request, env }) => {
  const sb  = adminClient(env);
  const url = new URL(request.url);
  const seg = url.pathname.replace(/.*\/api\/loyalty\/?/, '').split('/').filter(Boolean);
  const action = seg[0];

  if (request.method === 'POST' && action === 'earn') {
    const auth = request.headers.get('Authorization') || '';
    if (!auth.includes(env.INTERNAL_API_KEY || 'nexus-internal-2024')) return err('Non autorise', 401);
    const { userId, orderId, amountFcfa, reason = 'order', note } = await request.json().catch(() => ({}));
    if (!userId || !amountFcfa) return err('userId et amountFcfa requis', 400);
    const { data: lp } = await sb.from('loyalty_points').select('points,total_earned').eq('user_id', userId).single().catch(() => ({ data: null }));
    const tier = getTier(lp?.total_earned || 0);
    const pts  = Math.floor((amountFcfa / 100) * POINTS_PER_100 * tier.mult);
    if (pts <= 0) return ok({ points_added: 0 });
    const { data, error } = await sb.rpc('add_loyalty_points', { p_user_id:userId, p_delta:pts, p_reason:reason, p_order_id:orderId||null, p_note:note||`+${pts} pts` }).catch(() => ({ data:null, error:{message:'rpc absent'} }));
    if (error) {
      const newPts = (lp?.points||0) + pts;
      const newTotal = (lp?.total_earned||0) + pts;
      if (lp) { await sb.from('loyalty_points').update({ points:newPts, total_earned:newTotal, updated_at:new Date().toISOString() }).eq('user_id', userId).catch(() => {}); }
      else { await sb.from('loyalty_points').insert({ user_id:userId, points:pts, total_earned:pts, total_redeemed:0 }).catch(() => {}); }
      await sb.from('loyalty_history').insert({ user_id:userId, delta:pts, reason, order_id:orderId||null, note:note||`Commande ${Math.round(amountFcfa).toLocaleString('fr-FR')} FCFA`, created_at:new Date().toISOString() }).catch(() => {});
    }
    const oldTier = getTier(lp?.total_earned||0).name;
    const newTotal2 = (lp?.total_earned||0) + pts;
    const newTier = getTier(newTotal2).name;
    await sb.from('notifications').insert({ user_id:userId, type:'loyalty_points_earned', title:'Points fidelite', message:`+${pts} points ! (${tier.name})`, metadata:{ points:pts, order_id:orderId, tier:tier.name }, created_at:new Date().toISOString() }).catch(() => {});
    if (oldTier !== newTier) await sb.from('notifications').insert({ user_id:userId, type:'loyalty_tier_up', title:`Niveau ${newTier} atteint !`, message:`Felicitations ! Vous etes maintenant ${newTier}.`, metadata:{ old_tier:oldTier, new_tier:newTier }, created_at:new Date().toISOString() }).catch(() => {});
    return ok({ points_added:pts, tier:tier.name, mult:tier.mult });
  }

  const { user } = await requireAuth(env, request);

  if (request.method === 'GET' && !action) {
    const { data: lp } = await sb.from('loyalty_points').select('*').eq('user_id', user.id).single().catch(() => ({ data:null }));
    const points = lp?.points || 0;
    const total  = lp?.total_earned || 0;
    const tier   = getTier(total);
    const { data: history } = await sb.from('loyalty_history').select('*').eq('user_id', user.id).order('created_at', { ascending:false }).limit(30).catch(() => ({ data:[] }));
    return ok({ balance:{ points, total_earned:total, total_redeemed:lp?.total_redeemed||0, cash_value_fcfa:Math.floor(points)*POINT_FCFA, can_redeem:points>=MIN_REDEEM, min_redeem:MIN_REDEEM }, tier, tiers:TIERS, history:history||[] });
  }

  if (request.method === 'GET' && action === 'rewards') {
    const { data: lp } = await sb.from('loyalty_points').select('points,total_earned').eq('user_id', user.id).single().catch(() => ({ data:null }));
    const userPoints = lp?.points || 0;
    const { data: rewards } = await sb.from('loyalty_rewards').select('*').eq('active', true).order('points_cost', { ascending:true }).catch(() => ({ data:[] }));
    return ok({ rewards:(rewards||[]).map(r => ({ ...r, can_redeem:userPoints>=r.points_cost&&(r.stock==null||r.stock>0), value_label:r.type==='discount_percent'?`-${r.value}%`:r.type==='discount_fixed'?`-${r.value?.toLocaleString('fr-FR')} FCFA`:'Livraison gratuite' })), user_points:userPoints, user_tier:getTier(lp?.total_earned||0).name });
  }

  if (request.method === 'POST' && action === 'redeem') {
    const { rewardId, orderId } = await request.json().catch(() => ({}));
    if (!rewardId) return err('rewardId requis', 400);
    const { data: lp } = await sb.from('loyalty_points').select('*').eq('user_id', user.id).single().catch(() => ({ data:null }));
    const userPoints = lp?.points || 0;
    const { data: reward } = await sb.from('loyalty_rewards').select('*').eq('id', rewardId).eq('active', true).single().catch(() => ({ data:null }));
    if (!reward) return err('Recompense introuvable', 404);
    if (reward.stock != null && reward.stock <= 0) return err('Recompense epuisee', 400);
    if (userPoints < reward.points_cost) return err(`Points insuffisants. ${reward.points_cost - userPoints} manquants.`, 400);
    const newPoints = userPoints - reward.points_cost;
    await sb.from('loyalty_points').update({ points:newPoints, total_redeemed:(lp?.total_redeemed||0)+reward.points_cost, updated_at:new Date().toISOString() }).eq('user_id', user.id).catch(() => {});
    await sb.from('loyalty_history').insert({ user_id:user.id, delta:-reward.points_cost, reason:'redeem', note:`Echange: ${reward.name}`, order_id:orderId||null, created_at:new Date().toISOString() }).catch(() => {});
    let couponCode = null;
    if (['discount_percent','discount_fixed','free_shipping'].includes(reward.type)) {
      couponCode = `LOYAL${Math.random().toString(36).slice(2,8).toUpperCase()}`;
      await sb.from('coupons').insert({ code:couponCode, type:reward.type==='discount_percent'?'percent':reward.type==='discount_fixed'?'fixed':'free_shipping', value:reward.value||0, max_uses:1, once_per_user:true, user_id:user.id, expires_at:new Date(Date.now()+30*86400000).toISOString(), active:true, source:'loyalty', created_at:new Date().toISOString() }).catch(() => {});
    }
    if (reward.stock != null) await sb.from('loyalty_rewards').update({ stock:reward.stock-1 }).eq('id', rewardId).catch(() => {});
    await sb.from('notifications').insert({ user_id:user.id, type:'loyalty_redeem', title:'Recompense debloquee', message:`${reward.points_cost} pts -> "${reward.name}"${couponCode?`. Code: ${couponCode}`:''}`, metadata:{ reward_id:rewardId, coupon_code:couponCode }, created_at:new Date().toISOString() }).catch(() => {});
    return ok({ success:true, reward:reward.name, points_spent:reward.points_cost, points_left:newPoints, coupon_code:couponCode });
  }

  if (request.method === 'POST' && action === 'check') {
    const { data: lp } = await sb.from('loyalty_points').select('points').eq('user_id', user.id).single().catch(() => ({ data:null }));
    const points = lp?.points || 0;
    const { pointsToUse } = await request.json().catch(() => ({}));
    const pts = Math.min(pointsToUse||0, points);
    return ok({ available:points, discount_fcfa:Math.floor(pts)*POINT_FCFA, points_to_use:pts, rate:POINT_FCFA });
  }

  return err('Route introuvable', 404);
});