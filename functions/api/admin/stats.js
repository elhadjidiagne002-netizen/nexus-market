import { CORS, options, json, err, supabase, requireAdmin } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const sb = supabase(env);
    const [orders, products, profiles, pending, disputes] = await Promise.all([
      sb.from('orders').select('id,total,status,created_at', 'order=created_at.desc&limit=1000'),
      sb.from('products').select('id,active,moderated'),
      sb.from('profiles').select('id,role,created_at'),
      sb.from('pending_vendors').select('id', 'status=eq.pending'),
      sb.from('disputes').select('id,status', 'status=eq.open'),
    ]);
    const totalRevenue = (orders || []).filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0);
    const commission = totalRevenue * (parseFloat(env.NEXUS_COMMISSION) || 0.15);
    return json({
      totalOrders: (orders || []).length,
      totalRevenue, commission,
      totalProducts: (products || []).length,
      activeProducts: (products || []).filter(p => p.active && p.moderated).length,
      totalUsers: (profiles || []).length,
      totalVendors: (profiles || []).filter(p => p.role === 'vendor').length,
      pendingVendors: (pending || []).length,
      openDisputes: (disputes || []).length,
    });
  } catch (e) { return err(e.message, e.status || 500); }
}


