import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    const qs = user.role === 'vendor'
      ? `vendor_id=eq.${user.id}&status=in.(paid,delivered)&order=created_at.desc`
      : `buyer_id=eq.${user.id}&status=in.(paid,delivered)&order=created_at.desc`;
    const data = await sb.from('orders').select('*', qs);
    return json(data || []);
  } catch (e) { return err(e.message, 500); }
}


