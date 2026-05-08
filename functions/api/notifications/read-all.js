<<<<<<< HEAD
import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';
=======
import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';
>>>>>>> de181290f9e31c8efdacd3a0be8e832d7245e20c

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const sb = supabase(env);

    // POST: Marquer toutes les notifications comme lues
    if (request.method === 'POST') {
      const { data, error } = await sb
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('read', false)
        .select();

      if (error) throw error;
      return json(data || [], 200);
    }

    return err('Méthode non supportée', 405);
  } catch (error) {
    return err(error.message, error.status || 500);
  }
}



