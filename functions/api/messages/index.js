import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    const u = new URL(request.url);

    if (request.method === 'GET') {
      const limit = parseInt(u.searchParams.get('limit') || '30');
      const data = await sb.from('notifications')
        .select('*')
        .filter('user_id', 'eq', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      return json(data || []);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const notif = {
        user_id: body.userId || body.user_id,
        type:    body.type    || 'info',
        title:   body.title   || '',
        message: body.message || '',
        read:    false,
      };
      const saved = await sb.from('notifications').insert(notif).select().single();
      return json(saved, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
