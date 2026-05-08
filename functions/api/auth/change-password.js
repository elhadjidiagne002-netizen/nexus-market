import { CORS, options, json, err, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const { newPassword } = await request.json();
    if (!newPassword || newPassword.length < 8) return err('Mot de passe trop court (8 car. min)', 400);

    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json();
    if (!res.ok) return err(data.message || 'Erreur changement mot de passe', res.status);
    return json({ success: true });
  } catch (e) { return err(e.message, 500); }
}









