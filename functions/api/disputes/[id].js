import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (!['admin'].includes(user.role)) return err('Réservé aux admins', 403);
    const body = await request.json();
    const sb = supabase(env);
    const updated = await sb.from('disputes').update(body, `id=eq.${params.id}`);
    return json(Array.isArray(updated) ? updated[0] : updated);
  } catch (e) { return err(e.message, e.status || 500); }
}








