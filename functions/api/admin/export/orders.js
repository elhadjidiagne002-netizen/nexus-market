import { CORS, options, requireAdmin, supabase } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const sb = supabase(env);
    const data = await sb.from('orders').select('*', 'order=created_at.desc&limit=5000');
    const rows = ['ID,Acheteur,Vendeur,Total,Commission,Statut,Paiement,Date'];
    (data || []).forEach(o => {
      rows.push([o.id, `"${o.buyer_name||''}"`, `"${o.vendor_name||''}"`, o.total, o.commission, o.status, o.payment_method, o.created_at].join(','));
    });
    return new Response(rows.join('\n'), { headers: { ...CORS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nexus_orders.csv"' } });
  } catch (e) {
    const { err: errFn } = await import('../../_lib/utils.js');
    return errFn(e.message, 500);
  }
}


