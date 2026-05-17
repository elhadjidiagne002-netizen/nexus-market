// functions/api/ambassador/track-commission.js
// Appele par webhook PayTech/Stripe apres paiement confirme
import { adminClient, handle, ok, err } from '../_lib/supabase.js';

const RATES = { bronze:0.05, silver:0.07, gold:0.10, platinum:0.12 };
function getLevel(e) { return e>=500000?'platinum':e>=200000?'gold':e>=50000?'silver':'bronze'; }

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== 'POST') return err('POST requis', 405);
  const auth = request.headers.get('Authorization') || '';
  if (!auth.includes(env.INTERNAL_API_KEY || 'nexus-internal-2024')) return err('Non autorise', 401);

  const { orderId, refCode, orderTotal, buyerId } = await request.json().catch(() => ({}));
  if (!orderId || !orderTotal) return err('orderId et orderTotal requis', 400);

  const sb   = adminClient(env);
  let code   = refCode;

  if (!code) {
    const { data: ord } = await sb.from('orders').select('ref_code').eq('id', orderId).single().catch(() => ({ data: null }));
    code = ord?.ref_code;
  }
  if (!code) return ok({ tracked: false, reason: 'Aucun code de parrainage' });

  const { data: amb } = await sb.from('ambassadors').select('id,user_id,level,total_earned,total_sales,total_referrals,active').eq('code', code.toUpperCase()).eq('active', true).single().catch(() => ({ data: null }));
  if (!amb) return ok({ tracked: false, reason: 'Ambassadeur introuvable' });
  if (amb.user_id === buyerId) return ok({ tracked: false, reason: 'Auto-parrainage interdit' });

  const { data: existing } = await sb.from('ambassador_referrals').select('id').eq('order_id', orderId).single().catch(() => ({ data: null }));
  if (existing) return ok({ tracked: false, reason: 'Commission deja enregistree' });

  const rate = RATES[amb.level] || 0.05;
  const commission = Math.round(orderTotal * rate);

  await sb.from('ambassador_referrals').insert({ ambassador_id: amb.id, order_id: orderId, buyer_id: buyerId||null, order_total: Math.round(orderTotal), commission_amount: commission, commission_rate: rate, status: 'pending', confirm_after: new Date(Date.now()+7*86400000).toISOString(), created_at: new Date().toISOString() }).catch(() => {});

  const newEarned = (amb.total_earned||0) + commission;
  const newLevel  = getLevel(newEarned);
  await sb.from('ambassadors').update({ total_sales: Math.round((amb.total_sales||0)+orderTotal), total_earned: Math.round(newEarned), total_referrals: (amb.total_referrals||0)+1, level: newLevel, commission_rate: RATES[newLevel], updated_at: new Date().toISOString() }).eq('id', amb.id).catch(() => {});

  await sb.from('notifications').insert({ user_id: amb.user_id, type: 'ambassador_commission', title: 'Nouvelle commission !', message: `+${commission.toLocaleString('fr-FR')} FCFA (${(rate*100).toFixed(0)}%) sur commande de ${Math.round(orderTotal).toLocaleString('fr-FR')} FCFA`, metadata: { commission, order_id: orderId }, created_at: new Date().toISOString() }).catch(() => {});

  if (newLevel !== amb.level) {
    await sb.from('notifications').insert({ user_id: amb.user_id, type: 'ambassador_level_up', title: `Niveau ${newLevel} atteint !`, message: `Felicitations ! Nouveau taux: ${(RATES[newLevel]*100).toFixed(0)}%`, metadata: { old_level: amb.level, new_level: newLevel }, created_at: new Date().toISOString() }).catch(() => {});
  }

  return ok({ tracked: true, commission_amount: commission, commission_rate: rate, ambassador_level: newLevel });
});