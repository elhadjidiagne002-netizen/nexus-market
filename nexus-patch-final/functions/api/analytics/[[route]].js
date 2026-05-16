// functions/api/analytics/[[route]].js — Feature 22 : Dashboard analytics vendeur
// GET /api/analytics/vendor?period=30d
// GET /api/analytics/vendor/chart?period=30d
// GET /api/analytics/vendor/products?period=30d
// GET /api/analytics/vendor/export?period=30d&format=csv
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
    const vendorId = user.role === 'admin' && url.searchParams.get('vendor_id') ? url.searchParams.get('vendor_id') : user.id;
    const { since } = getPeriod(period);

    if (!route || route === 'vendor') return getDashboard(sb, vendorId, since, period);
    if (route === 'vendor/chart')     return getChart(sb, vendorId, since, url);
    if (route === 'vendor/products')  return getProducts(sb, vendorId, since);
    if (route === 'vendor/export')    return exportCSV(sb, vendorId, since, url);

    return err('Route introuvable', 404);
  } catch (e) { return err(e.message, e.status || 500); }
}

async function getDashboard(sb, vendorId, since, period) {
  const orders = await sb.from('orders').select('id,total,status,created_at,buyer_id',
    `vendor_id=eq.${vendorId}&created_at=gte.${since}&payment_status=eq.paid`
  ) || [];

  const revenue      = orders.reduce((s, o) => s + (o.total || 0), 0);
  const uniqueBuyers = new Set(orders.map(o => o.buyer_id)).size;

  const prevSince = getPeriod(period, 2).since;
  const prevOrders = await sb.from('orders').select('total',
    `vendor_id=eq.${vendorId}&created_at=gte.${prevSince}&created_at=lt.${since}&payment_status=eq.paid`
  ) || [];
  const prevRevenue = prevOrders.reduce((s, o) => s + (o.total || 0), 0);

  const products = await sb.from('products').select('id,stock', `vendor_id=eq.${vendorId}&status=eq.active`) || [];

  return json({
    period: { since, label: period },
    kpis: {
      revenue:       { value: revenue, prev: prevRevenue, growth: prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null },
      orders:        { value: orders.length },
      avg_order:     { value: orders.length ? Math.round(revenue / orders.length) : 0 },
      unique_buyers: { value: uniqueBuyers },
      products:      { active: products.length, low_stock: products.filter(p => (p.stock || 0) < 5).length },
    },
    status_breakdown: orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {}),
  });
}

async function getChart(sb, vendorId, since, url) {
  const orders = await sb.from('orders').select('total,created_at,status',
    `vendor_id=eq.${vendorId}&created_at=gte.${since}&payment_status=eq.paid&order=created_at.asc`
  ) || [];

  const grouped = {};
  for (const o of orders) {
    const day = o.created_at.slice(0, 10);
    if (!grouped[day]) grouped[day] = { date: day, revenue: 0, orders: 0 };
    grouped[day].revenue += o.total || 0;
    grouped[day].orders++;
  }

  const days = getDaysRange(since);
  return json({ timeline: days.map(d => grouped[d] || { date: d, revenue: 0, orders: 0 }), totals: { revenue: orders.reduce((s, o) => s + o.total, 0), orders: orders.length } });
}

async function getProducts(sb, vendorId, since) {
  const products = await sb.from('products').select('id,name,images,price,stock,rating', `vendor_id=eq.${vendorId}&status=eq.active`) || [];
  return json({ products: products.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 20) });
}

async function exportCSV(sb, vendorId, since, url) {
  const format = url.searchParams.get('format') || 'csv';
  const orders = await sb.from('orders').select('id,total,status,payment_status,created_at',
    `vendor_id=eq.${vendorId}&created_at=gte.${since}&order=created_at.desc&limit=1000`
  ) || [];

  if (format === 'json') return json(orders);

  const rows = orders.map(o => [
    o.id?.slice(0, 8).toUpperCase(),
    o.status, o.payment_status,
    o.total,
    new Date(o.created_at).toLocaleDateString('fr-FR'),
  ]);
  const csv = ['ID,Statut,Paiement,Montant,Date', ...rows.map(r => r.join(','))].join('\r\n');

  return new Response('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nexus-analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function getPeriod(period, mult = 1) {
  const ms = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 }[period] || 30;
  return { since: new Date(Date.now() - ms * mult * 86400000).toISOString() };
}

function getDaysRange(since) {
  const days = [], start = new Date(since), end = new Date();
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}
