import { CORS, options, requireAdmin, supabase } from '../../../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const sb = supabase(env);
    const data = await sb.from('profiles').select('id,name,email,shop_name,shop_category,rating,total_sales,commission_rate,created_at', 'role=eq.vendor&order=created_at.desc');
    const rows = ['ID,Boutique,Email,Catégorie,Note,CA EUR,Commission%,Inscrit le'];
    (data || []).forEach(v => {
      rows.push([v.id, `"${v.shop_name||v.name||''}"`, v.email, v.shop_category, v.rating, v.total_sales, v.commission_rate, v.created_at].join(','));
    });
    return new Response(rows.join('\n'), { headers: { ...CORS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nexus_vendors.csv"' } });
  } catch (e) {
    const { err: errFn } = await import('../../../../../_lib/utils.js');
    return errFn(e.message, 500);
  }
}
