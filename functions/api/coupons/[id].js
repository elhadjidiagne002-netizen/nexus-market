import { CORS, options, json, err, supabase, requireAdmin } from '../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const sb = supabase(env);
    if (request.method === 'PATCH' || request.method === 'PUT') {
      const body = await request.json();
      const updated = await sb.from('coupons').update(body, `id=eq.${params.id}`);
      return json(Array.isArray(updated) ? updated[0] : updated);
    }
    if (request.method === 'DELETE') {
      await sb.from('coupons').delete(`id=eq.${params.id}`);
      return json({ success: true });
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}








