// functions/api/loyalty/index.js
// GET  /api/loyalty            -> solde + tier + historique
// POST /api/loyalty/earn       -> crediter (interne, INTERNAL_API_KEY)
// POST /api/loyalty/redeem     -> echanger des points
// GET  /api/loyalty/rewards    -> catalogue recompenses
// POST /api/loyalty/check      -> calculer remise avant achat
import { adminClient, requireAuth, handle, ok, err } from '../_lib/supabase.js';

const POINTS_PER_100 = 1;
const POINT_FCFA     = 5;
const MIN_REDEEM     = 100;

const TIERS = [
  { name:'Bronze',  min:0,     mult:1.0, perks:['1 pt/100 FCFA','Flash 1h avant'] },
  { name:'Argent',  min:1000,  mult:1.5, perks:['1.5 pt/100 FCFA','Livraison offerte 10k+'] },
  { name:'Or',      min:5000,  mult:2.0, perks:['2 pts/100 FCFA','Livraison offerte 5k+','Support prioritaire'] },
  { name:'Platine', min:15000, mult:3.0, perks:['3 pts/100 FCFA','Livraison toujours gratuite','Gestionnaire dedie'] },
];

function getTier(total) {
  const t = [...TIERS].reverse().find(t => total >= t.min) || TIERS[0];
  const idx = TIERS.indexOf(t);
  const next = TIERS[idx+1] || null;
  return {
    ...t,
    progress_pct: next ? Math.min(100, Math.round(((total-t.min)/(next.min-t.min))*100)) : 100,
    next_tier: next ? { name:next.name, points_needed: next.min-total } : null,
  };
}

export const onRequest = handle(async ({ request, env }) => {
  const sb  = adminClient(env);
  const url = new URL(request.url);
  const seg = url.pathname.replace(/.*\/api\/loyalty\/?/, '').split('/').filter(Boolean);
  const action = seg[0];

  // ── POST /api/loyalty/earn → webhook interne (apres paiement confirme) ──
  if (request.method === 'POST' && action === 'earn') {
    const auth = request.headers.get('Authorization') || '';
    if (!auth.includes(env.INTERNAL_API_KEY || 'nexus-internal-2024')) return err('Non autorise', 401);
    const { userId, orderId, amountFcfa, reason = 'order', note } = await request.json().catch(() => ({}));
    if (!userId || !amountFcfa) return err('userId et amountFcfa requis', 400);
    const { data: lp } = await sb.from('loyalty_points').select('points,total_earned').eq('user_id', userId).single().catch(() => ({ data: null }));
    const tier = getTier(lp?.total_earned || 0);
    const pts  = Math.floor((amountFcfa / 100) * POINTS_PER_100 * tier.mult);
    if (pts <= 0) return ok({ points_added: 0 });
    // Tentative RPC SQL atomique, fallback manuel si absente
    const { error: rpcErr } = await sb.rpc('add_loyalty_points', {
      p_user_id:userId, p_delta:pts, p_reason:reason, p_order_id:orderId||null, p_note:note||`+${pts} pts`,
    }).catch(() => ({ error: { message: 'rpc absent' } }));
    if (rpcErr) {
      const newPts   = (lp?.points||0) + pts;
      const newTotal = (lp?.total_earned||0) + pts;
      if (lp) {
        await sb.from('loyalty_points').update({ points:newPts, total_earned:newTotal, updated_at:new Date().toISOString() }).eq('user_id', userId).catch(() => {});
      } else {
        await sb.from('loyalty_points').insert({ user_id:userId, points:pts, total_earned:pts, total_redeemed:0 }).catch(() => {});
      }
      await sb.from('loyalty_history').insert({ user_id:userId, delta:pts, reason, order_id:orderId||null, note:note||`Commande ${Math.round(amountFcfa).toLocaleString('fr-FR')} FCFA`, created_at:new Date().toISOString() }).catch(() => {});
    }
    // Notification + detection montee de niveau
    const oldTier   = getTier(lp?.total_earned||0).name;
    const newTierNm = getTier((lp?.total_earned||0)+pts).name;
    await sb.from('notifications').insert({ user_id:userId, type:'loyalty_points_earned', title:'Points fidelite', message:`+${pts} points (${tier.title})`, metadata:{ points:pts, order_id:orderId }, created_at:new Date().toISOString() }).catch(() => {});
    if (oldTier !== newTierNm) {
      await sb.from('notifications').insert({ user_id:userId, type:'loyalty_tier_up', title:`Niveau ${newTierNm} atteint !`, message:`Vous etes maintenant ${newTierNm}.`, metadata:{ old_tier:oldTier, new_tier:newTierNm }, created_at:new Date().toISOString() }).catch(() => {});
    }
    return ok({ points_added:pts, tier:tier.title, mult:tier.mult });
  }

  // Routes authentifiees
  const { user } = await requireAuth(env, request);

  // ── GET /api/loyalty → solde + tier + historique ──────────────────────
  if (request.method === 'GET' && !action) {
    const { data: lp } = await sb.from('loyalty_points').select('*').eq('user_id', user.id).single().catch(() => ({ data:null }));
    const points = lp?.points || 0;
    const total  = lp?.total_earned || 0;
    const tier   = getTier(total);
    const { data: history } = await sb.from('loyalty_history').select('*').eq('user_id', user.id).order('created_at', { ascending:false }).limit(30).catch(() => ({ data:[] }));
    return ok({
      balance: { points, total_earned:total, total_redeemed:lp?.total_redeemed||0, cash_value_fcfa:Math.floor(points)*POINT_FCFA, can_redeem:points>=MIN_REDEEM, min_redeem:MIN_REDEEM },
      tier, tiers:TIERS, history:history||[],
    });
  }

  // ── GET /api/loyalty/rewards → catalogue ──────────────────────────────
  if (request.method === 'GET' && action === 'rewards') {
    const { data: lp } = await sb.from('loyalty_points').select('points,total_earned').eq('user_id', user.id).single().catch(() => ({ data:null }));
    const userPoints = lp?.points || 0;
    const { data: rewards } = await sb.from('loyalty_rewards').select('*').eq('active', true).order('points_cost', { ascending:true }).catch(() => ({ data:[] }));
    return ok({
      rewards: (rewards||[]).map(r => ({
        ...r,
        can_redeem: userPoints >= r.points_required && (r.stock == null || r.stock > 0),
        value_label: r.reward_type === 'discount_percent' ? `-${r.reward_value}%` : r.reward_type === 'discount_fixed' ? `-${r.reward_value?.toLocaleString('fr-FR')} FCFA` : 'Livraison gratuite',
      })),
      user_points: userPoints,
      user_tier: getTier(lp?.total_earned||0).name,
    });
  }

  // ── POST /api/loyalty/redeem → echanger des points ────────────────────
  if (request.method === 'POST' && action === 'redeem') {
    const { rewardId, orderId } = await request.json().catch(() => ({}));
    if (!rewardId) return err('rewardId requis', 400);
    const { data: lp } = await sb.from('loyalty_points').select('*').eq('user_id', user.id).single().catch(() => ({ data:null }));
    const userPoints = lp?.points || 0;
    const { data: reward } = await sb.from('loyalty_rewards').select('*').eq('id', rewardId).eq('active', true).single().catch(() => ({ data:null }));
    if (!reward) return err('Recompense introuvable', 404);
    if (reward.stock != null && reward.stock <= 0) return err('Recompense epuisee', 400);
    if (userPoints < reward.points_required) return err(`Points insuffisants. ${reward.points_required - userPoints} manquants.`, 400);
    const newPoints = userPoints - reward.points_required;
    await sb.from('loyalty_points').update({ points:newPoints, total_redeemed:(lp?.total_redeemed||0)+reward.points_required, updated_at:new Date().toISOString() }).eq('user_id', user.id).catch(() => {});
    await sb.from('loyalty_history').insert({ user_id:user.id, delta:-reward.points_required, reason:'redeem', note:`Echange: ${reward.title}`, order_id:orderId||null, created_at:new Date().toISOString() }).catch(() => {});
    let couponCode = null;
    if (['discount_percent','discount_fixed','free_shipping'].includes(reward.reward_type)) {
      couponCode = `LOYAL${Math.random().toString(36).slice(2,8).toUpperCase()}`;
      await sb.from('coupons').insert({ code:couponCode, type:reward.reward_type==='discount_percent'?'percent':reward.reward_type==='discount_fixed'?'fixed':'free_shipping', value:reward.reward_value||0, max_uses:1, once_per_user:true, user_id:user.id, expires_at:new Date(Date.now()+30*86400000).toISOString(), active:true, source:'loyalty', created_at:new Date().toISOString() }).catch(() => {});
    }
    if (reward.stock != null) await sb.from('loyalty_rewards').update({ stock:reward.stock-1 }).eq('id', rewardId).catch(() => {});
    await sb.from('notifications').insert({ user_id:user.id, type:'loyalty_redeem', title:'Recompense debloquee', message:`${reward.points_required} pts -> "${reward.title}"${couponCode?`. Code: ${couponCode}`:''}`, metadata:{ reward_id:rewardId, coupon_code:couponCode }, created_at:new Date().toISOString() }).catch(() => {});
    return ok({ success:true, reward:reward.title, points_spent:reward.points_required, points_left:newPoints, coupon_code:couponCode });
  }

  // ── POST /api/loyalty/check → calculer remise avant achat ────────────
  if (request.method === 'POST' && action === 'check') {
    const { data: lp } = await sb.from('loyalty_points').select('points').eq('user_id', user.id).single().catch(() => ({ data:null }));
    const points = lp?.points || 0;
    const { pointsToUse } = await request.json().catch(() => ({}));
    const pts = Math.min(pointsToUse||0, points);
    return ok({ available:points, discount_fcfa:Math.floor(pts)*POINT_FCFA, points_to_use:pts, rate:POINT_FCFA });
  }

  return err('Route introuvable', 404);
});