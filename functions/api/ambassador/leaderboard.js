// functions/api/ambassador/leaderboard.js
import { adminClient, handle, ok, err } from '../_lib/supabase.js';

const BADGES = { bronze:'🥉', silver:'🥈', gold:'🥇', platinum:'💎' };
const LABELS = { bronze:'Bronze', silver:'Argent', gold:'Or', platinum:'Platine' };

export const onRequest = handle(async ({ request, env }) => {
  const sb    = adminClient(env);
  const url   = new URL(request.url);
  const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '20'));

  const { data: ambassadors, error } = await sb.from('ambassadors')
    .select('id,code,level,total_earned,total_referrals,total_sales,user_id')
    .eq('active', true).order('total_earned', { ascending: false }).limit(limit);

  if (error) return err(error.message, 500);

  const userIds = (ambassadors || []).map(a => a.user_id);
  let profileMap = {};
  if (userIds.length) {
    const { data: profiles } = await sb.from('profiles').select('id,name,avatar').in('id', userIds).catch(() => ({ data: [] }));
    (profiles || []).forEach(p => { profileMap[p.id] = p; });
  }

  const leaderboard = (ambassadors || []).map((amb, idx) => {
    const p = profileMap[amb.user_id] || {};
    return {
      rank: idx + 1,
      code: amb.code,
      level: amb.level || 'bronze',
      badge: BADGES[amb.level] || '🥉',
      level_label: LABELS[amb.level] || 'Bronze',
      name: p.name || `Ambassadeur #${idx+1}`,
      avatar: p.avatar || null,
      total_earned: Math.round(amb.total_earned || 0),
      total_sales: Math.round(amb.total_sales || 0),
      total_referrals: amb.total_referrals || 0,
      is_top3: idx < 3,
    };
  });

  return ok({
    leaderboard,
    stats: {
      total_ambassadors: leaderboard.length,
      total_commissions: leaderboard.reduce((s,a) => s+a.total_earned, 0),
      top_earner: leaderboard[0] || null,
    },
  });
});