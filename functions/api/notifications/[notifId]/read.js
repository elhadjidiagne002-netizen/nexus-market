import { CORS, options, json, err, supabase, requireAuth } from '../../../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const sb = supabase(env);
    const { error } = await sb
      .from('notifications')
      .update({
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', params.notifId)
      .eq('user_id', user.id);

    if (error) return err(error.message, 500);

    return json({ success: true });
  } catch (e) {
    return err(e.message, 500);
  }
}
