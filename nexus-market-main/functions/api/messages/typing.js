import { CORS, options, json, err, requireAuth } from '../../_lib/utils.js';

// Simple endpoint — le typing indicator est géré en Realtime Supabase
// Ici on répond juste 200 pour compatibilité
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    return json({ ok: true });
  } catch (e) { return err(e.message, 500); }
}



