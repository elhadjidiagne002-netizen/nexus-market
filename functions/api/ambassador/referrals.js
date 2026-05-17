// functions/api/ambassador/referrals.js
import { adminClient, requireAuth, handle, ok, err } from '../_lib/supabase.js';

export const onRequest = handle(async ({ request, env }) => {
  const sb  = adminClient(env);
  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  if (request.method === 'GET' && type === 'link') {
    const { user } = await requireAuth(env, request);
    const { data: amb } = await sb.from('ambassadors').select('code').eq('user_id', user.id).single().catch(() => ({ data: null }));
    if (!amb?.code) return err('Profil ambassadeur introuvable', 404);
    const base = env.FRONTEND_URL || env.SITE_URL || 'https://nexus-market-md360.vercel.app';
    const code = amb.code;
    return ok({
      code,
      links: { home:`${base}/?ref=${code}`, products:`${base}/products?ref=${code}`, vendor:`${base}/vendors?ref=${code}` },
      qr_url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${base}/?ref=${code}`)}`,
      share: {
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`Rejoins NEXUS Market ! ${base}/?ref=${code}`)}`,
        sms: `sms:?body=${encodeURIComponent(`Code promo NEXUS: ${code} -> ${base}/?ref=${code}`)}`,
      },
    });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { code } = body;
    if (!code) return err('code requis', 400);
    const { data: amb } = await sb.from('ambassadors').select('id').eq('code', code.toUpperCase()).eq('active', true).single().catch(() => ({ data: null }));
    if (!amb) return ok({ tracked: false });
    await sb.from('ambassador_clicks').insert({ ambassador_id: amb.id, created_at: new Date().toISOString() }).catch(() => {});
    return new Response(JSON.stringify({ tracked: true, code }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Set-Cookie': `nexus_ref=${code}; Path=/; Max-Age=${30*86400}; SameSite=Lax` },
    });
  }

  const { user } = await requireAuth(env, request);
  const page  = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const { data: amb } = await sb.from('ambassadors').select('id,code,total_earned,total_referrals,commission_rate').eq('user_id', user.id).single().catch(() => ({ data: null }));
  if (!amb) return ok({ referrals: [], stats: null });
  const { data: referrals } = await sb.from('ambassador_referrals').select('id,status,commission_amount,order_total,created_at,confirmed_at').eq('ambassador_id', amb.id).order('created_at', { ascending: false }).range((page-1)*limit, page*limit-1).catch(() => ({ data: [] }));
  const all = await sb.from('ambassador_referrals').select('status,commission_amount,order_total').eq('ambassador_id', amb.id).catch(() => ({ data: [] }));
  const allData = all?.data || [];
  const stats = {
    total: allData.length,
    confirmed: allData.filter(r => ['confirmed','paid'].includes(r.status)).length,
    pending: allData.filter(r => r.status === 'pending').length,
    total_commission: Math.round(allData.reduce((s,r) => s+(r.commission_amount||0), 0)),
    total_sales: Math.round(allData.reduce((s,r) => s+(r.order_total||0), 0)),
  };
  return ok({ referrals: referrals?.data || referrals || [], stats, ambassador: { code: amb.code, commission_rate: amb.commission_rate }, page, limit });
});