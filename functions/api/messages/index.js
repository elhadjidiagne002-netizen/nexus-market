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
      const convId = url.searchParams.get('convId') || url.searchParams.get('conversation_id');
      let qs = `order=created_at.desc&limit=${limit}`;
      if (convId) qs += `&conversation_id=eq.${convId}`;
      const data = await sb.from('messages').select('*', qs);
      return json(data || []);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const data = await sb.from('messages').insert({
        user_id: body.user_id || user.id,
        conversation_id: body.conversation_id || body.convId,
        content: body.content || '',
        read: false,
      });
      return json(Array.isArray(data) ? data[0] : data, 201);
    }

    return err('Methode non supportee', 405);
  } catch (e) {
    return err(e.message, e.status || 500);
  }
}