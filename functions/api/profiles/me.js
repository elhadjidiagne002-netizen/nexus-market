import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const sb = supabase(env);

    if (request.method === 'GET') {
      const { data, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      if (!data) return err('Profil non trouvé', 404);
      return json(data);
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const { data: updated, error } = await sb
        .from('profiles')
        .update({
          name: body.name,
          email: body.email,
          phone: body.phone,
          address: body.address,
          city: body.city,
          country: body.country,
          bio: body.bio,
          avatar: body.avatar,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      return json(updated);
    }

    return err('Méthode non supportée', 405);
  } catch (error) {
    return err(error.message, error.status || 500);
  }
}






