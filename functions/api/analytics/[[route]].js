// Feature 22 : Dashboard analytics vendeur
import { options, json, err, supabase, requireAuth } from '../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb    = supabase(env);
  const route = Array.isArray(params?.route) ? params.route.join('/') : (params?.route || '');
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (!['vendor','admin'].includes(user.role)) return err('Accès vendeur requis', 403);
    const url      = new URL(request.url);
    const period   = url.searchParams.get('period') || '30d';
    const vId      = user.role === 'admin' && url.searchParams.get('vendor_id') ? url.searchParams.get('vendor_id') : user.id;
    const ms       = {'7d':7,'30d':30,'90d':90,'12m':365}[period]||30;
    const since    = new Date(Date.now() - ms*86400000).toISOString();
    const since2x  = new Date(Date.now() - ms*2*86400000).toISOString();

    const orders = await sb.from('orders').select('id,total,status,created_at,buyer_id',
      `vendor_id=eq.${vId}&created_at=gte.${since}&payment_status=eq.paid`) || [];
    const revenue  = orders.reduce((s,o) => s+(o.total||0), 0);
    const buyers   = new Set(orders.map(o => o.buyer_id)).size;
    const prev     = await sb.from('orders').select('total',
      `vendor_id=eq.${vId}&created_at=gte.${since2x}&created_at=lt.${since}&payment_status=eq.paid`) || [];
    const prevRev  = prev.reduce((s,o) => s+(o.total||0), 0);
    const products = await sb.from('products').select('id,stock', `vendor_id=eq.${vId}&status=eq.active`) || [];

    if (!route || route === 'vendor') {
      return json({ period: { since, label: period }, kpis: {
        revenue: { value: revenue, prev: prevRev, growth: prevRev>0 ? Math.round(((revenue-prevRev)/prevRev)*100) : null },
        orders: { value: orders.length }, avg_order: { value: orders.length ? Math.round(revenue/orders.length) : 0 },
        unique_buyers: { value: buyers }, products: { active: products.length, low_stock: products.filter(p=>(p.stock||0)<5).length },
      }, status_breakdown: orders.reduce((a,o) => { a[o.status]=(a[o.status]||0)+1; return a; }, {}) });
    }

    if (route === 'vendor/chart') {
      const grouped = {};
      orders.forEach(o => { const d = o.created_at.slice(0,10); if(!grouped[d]) grouped[d]={date:d,revenue:0,orders:0}; grouped[d].revenue+=o.total||0; grouped[d].orders++; });
      const days = []; const start = new Date(since); const end = new Date();
      for (const d = new Date(start); d<=end; d.setDate(d.getDate()+1)) days.push(d.toISOString().slice(0,10));
      return json({ timeline: days.map(d => grouped[d]||{date:d,revenue:0,orders:0}),
        totals: { revenue, orders: orders.length } });
    }

    if (route === 'vendor/export') {
      const fmt = url.searchParams.get('format') || 'csv';
      if (fmt === 'json') return json(orders);
      const csv = ['ID,Statut,Paiement,Montant,Date',
        ...orders.map(o => [o.id?.slice(0,8).toUpperCase(),o.status,o.payment_status,o.total,
          new Date(o.created_at).toLocaleDateString('fr-FR')].join(','))].join('\r\n');
      return new Response('\uFEFF'+csv, { headers: { 'Content-Type':'text/csv;charset=utf-8',
        'Content-Disposition':`attachment;filename="nexus-analytics-${new Date().toISOString().slice(0,10)}.csv"` }});
    }

    return err('Route introuvable', 404);
  } catch (e) { return err(e.message, e.status || 500); }
}
