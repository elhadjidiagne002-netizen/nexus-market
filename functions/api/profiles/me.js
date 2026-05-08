import { CORS, options, json, err, supabase, requireAuth } from '../../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);

    if (request.method === 'GET') {
      const data = await sb.from('profiles').select('*', \`id=eq.\${user.id}\`);
      return json(data?.[0] || user);
    }
    if (request.method === 'PATCH' || request.method === 'PUT') {
      const body = await request.json();
      delete body.id; delete body.email; delete body.role; // champs protégés
      const updated = await sb.from('profiles').update(body, \`id=eq.\${user.id}\`);
      return json(Array.isArray(updated) ? updated[0] : updated);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
