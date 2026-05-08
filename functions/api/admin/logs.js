import { CORS, options, json, err, requireAdmin } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    // Logs Supabase via l'API admin — retourner un tableau vide si non configuré
    return json({ logs: [], message: 'Connectez Logflare ou Sentry pour les logs de production' });
  } catch (e) { return err(e.message, 500); }
}


