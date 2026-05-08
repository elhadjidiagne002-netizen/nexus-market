import { CORS, options, json, err, supabase, requireAuth } from '';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const sb = supabase(env);

    if (request.method === 'POST') {
      const { data, error } = await sb
        .from('notifications')
        .update({
          read: true,
          read_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('read', false)
        .select();

      if (error) throw error;
      return json(data || []);
    }

    return err('Méthode non supportée', 405);
  } catch (error) {
    return err(error.message, error.status || 500);
  }
}


