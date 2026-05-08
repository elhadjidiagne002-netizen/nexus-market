import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const sb = supabase(env);
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';

    if (request.method === 'GET') {
      let query = sb
        .from('users')
        .select('id, name, email, role, avatar, shop_name');

      if (q.trim() !== '') {
        query = query.or(`name.ilike.*${q}*,email.ilike.*${q}*`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return json(data || []);
    }

    return err('Méthode non supportée', 405);
  } catch (error) {
    return err(error.message, error.status || 500);
  }
}






