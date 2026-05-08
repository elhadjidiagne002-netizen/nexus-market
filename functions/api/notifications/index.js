import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    if (request.method === 'GET') {
      const data = await sb.from('notifications').select('*', \`user_id=eq.\${user.id}&order=created_at.desc&limit=30\`);
      return json(data || []);
    }
    if (request.method === 'POST') {
      // Admin peut créer des notifs pour d'autres users
      const body = await request.json();
      const notif = { ...body, user_id: body.user_id || user.id };
      const data = await sb.from('notifications').insert(notif);
      return json(Array.isArray(data) ? data[0] : data, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
