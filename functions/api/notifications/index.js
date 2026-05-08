import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const sb = supabase(env);
    const url = new URL(request.url);

    // GET: Récupérer les notifications
    if (request.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '30');
      const { data, error } = await sb
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)  // ✅ Syntaxe corrigée
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return json(data || []);
    }

    // POST: Créer une notification
    if (request.method === 'POST') {
      const body = await request.json();
      const notification = {
        user_id: body.user_id || user.id,
        type: body.type || 'info',
        title: body.title || '',
        message: body.message || '',
        read: false,
      };

      const { data: saved, error } = await sb
        .from('notifications')
        .insert(notification)
        .select()
        .single();

      if (error) throw error;
      return json(saved, 201);
    }

    return err('Méthode non supportée', 405);
  } catch (error) {
    return err(error.message, error.status || 500);
  }
}
