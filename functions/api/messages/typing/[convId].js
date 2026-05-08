import { CORS, options, json, err, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    return json({ ok: true, convId: params.convId });
  } catch (e) { return err(e.message, 500); }
}


