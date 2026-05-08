import { CORS, options, requireAdmin, supabase } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const sb = supabase(env);
    const data = await sb.from('profiles').select('id,name,email,role,status,created_at', 'order=created_at.desc&limit=5000');
    const rows = ['ID,Nom,Email,Rôle,Statut,Inscrit le'];
    (data || []).forEach(u => {
      rows.push([u.id, `"${u.name||''}"`, u.email, u.role, u.status, u.created_at].join(','));
    });
    return new Response(rows.join('\n'), { headers: { ...CORS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nexus_users.csv"' } });
  } catch (e) {
    const { err: errFn } = await import('../../_lib/utils.js');
    return errFn(e.message, 500);
  }
}


