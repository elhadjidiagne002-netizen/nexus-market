import { CORS, options, json, err, supabase, requireAdmin } from '';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const sb = supabase(env);
    const data = await sb.from('payout_requests').select('*', 'order=created_at.desc');
    return json(data || []);
  } catch (e) { return err(e.message, e.status || 500); }
}





