import { CORS, options, json, err, requireAdmin } from '../../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    if (!env.RESEND_API_KEY) return json({ data: [], message: 'RESEND_API_KEY non configuré' });
    const res = await fetch('https://api.resend.com/emails?limit=100', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    });
    const data = await res.json();
    return json(data);
  } catch (e) { return err(e.message, 500); }
}
