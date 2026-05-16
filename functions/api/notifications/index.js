import { options, json, err, supabase, requireAuth } from '../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;
    const sb = supabase(env);
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '30');
      const data = await sb.from('notifications').select('*',
        `user_id=eq.${user.id}&order=created_at.desc&limit=${limit}`
      );
      return json(data || []);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const data = await sb.from('notifications').insert({
        user_id: body.user_id || user.id,
        type: body.type || 'info',
        title: body.title || '',
        message: body.message || '',
        read: false,
      });
      return json(Array.isArray(data) ? data[0] : data, 201);
    }

    return err('Methode non supportee', 405);
  } catch (e) {
    return err(e.message, e.status || 500);
  }
}