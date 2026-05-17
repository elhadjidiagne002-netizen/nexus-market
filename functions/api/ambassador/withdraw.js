/ functions/api/ambassador/withdraw.js
import { adminClient, requireAuth, handle, ok, err } from '../_lib/supabase.js';

const MIN = 2000;
const PROVIDERS = ['orange_money','wave','free_money','expresso'];

export const onRequest = handle(async ({ request, env }) => {
  const { user, sb } = await requireAuth(env, request);

  if (request.method === 'GET') {
    const { data: amb } = await sb.from('ambassadors').select('id,total_earned,level,commission_rate').eq('user_id', user.id).single().catch(() => ({ data: null }));
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const { data: withdrawals } = await sb.from('payout_requests').select('id,amount,method,phone,provider,status,created_at,processed_at').eq('vendor_id', user.id).order('created_at', { ascending: false }).range((page-1)*limit, page*limit-1).catch(() => ({ data: [] }));
    const allW = await sb.from('payout_requests').select('amount,status').eq('vendor_id', user.id).catch(() => ({ data: [] }));
    const paid    = (allW?.data||[]).filter(w => ['approved','paid'].includes(w.status)).reduce((s,w) => s+(w.amount||0), 0);
    const pending = (allW?.data||[]).filter(w => w.status === 'pending').reduce((s,w) => s+(w.amount||0), 0);
    const available = Math.max(0, (amb?.total_earned||0) - paid - pending);
    return ok({ balance: { total_earned: Math.round(amb?.total_earned||0), paid_out: Math.round(paid), pending: Math.round(pending), available: Math.round(available) }, withdrawals: withdrawals?.data||withdrawals||[], ambassador: amb ? { level: amb.level, commission_rate: amb.commission_rate } : null, page, limit });
  }

  if (request.method !== 'POST') return err('Methode non autorisee', 405);
  const { amount, phone, provider = 'orange_money' } = await request.json().catch(() => ({}));
  if (!amount || amount < MIN) return err(`Montant minimum ${MIN.toLocaleString('fr-FR')} FCFA`, 400);
  if (!phone) return err('Numero de telephone requis', 400);
  if (!PROVIDERS.includes(provider)) return err(`Provider invalide: ${PROVIDERS.join(', ')}`, 400);

  const { data: amb } = await sb.from('ambassadors').select('id,total_earned').eq('user_id', user.id).single().catch(() => ({ data: null }));
  if (!amb) return err('Profil ambassadeur introuvable', 404);

  const allW = await sb.from('payout_requests').select('amount,status').eq('vendor_id', user.id).catch(() => ({ data: [] }));
  const paid    = (allW?.data||[]).filter(w => ['approved','paid'].includes(w.status)).reduce((s,w) => s+(w.amount||0), 0);
  const pending = (allW?.data||[]).filter(w => w.status === 'pending').reduce((s,w) => s+(w.amount||0), 0);
  const available = Math.max(0, (amb.total_earned||0) - paid - pending);
  if (amount > available) return err(`Solde insuffisant. Disponible: ${Math.round(available).toLocaleString('fr-FR')} FCFA`, 400);

  const { data: payout, error } = await sb.from('payout_requests').insert({ vendor_id: user.id, amount: Math.round(amount), method: 'mobile_money', phone, provider, status: 'pending', note: `Retrait commission ambassadeur — ${provider}`, created_at: new Date().toISOString() }).select().single().catch(e => ({ data: null, error: e }));
  if (error || !payout) return err('Erreur creation retrait', 500);

  await sb.from('notifications').insert({ user_id: user.id, type: 'withdrawal_requested', title: 'Retrait demande', message: `${Math.round(amount).toLocaleString('fr-FR')} FCFA via ${provider}`, metadata: { payout_id: payout.id }, created_at: new Date().toISOString() }).catch(() => {});
  return ok({ success: true, payout, balance_after: Math.round(available-amount), message: `Retrait de ${Math.round(amount).toLocaleString('fr-FR')} FCFA soumis. Traitement 24-48h.` }, 201);
});