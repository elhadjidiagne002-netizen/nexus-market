import { CORS, options, json, err, supabase, requireAdmin } from '../../../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const sb = supabase(env);
    const data = await sb.from('pending_vendors').select('*', 'status=eq.pending&order=created_at.desc');
    return json(data || []);
  } catch (e) { return err(e.message, e.status || 500); }
}
