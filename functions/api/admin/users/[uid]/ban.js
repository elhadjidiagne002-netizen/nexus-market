import { CORS, options, json, err, supabase, requireAdmin, sendEmail } from '';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const { reason, unban } = await request.json();
    const sb = supabase(env);
    const newStatus = unban ? 'active' : 'banned';
    await sb.from('profiles').update({ status: newStatus }, `id=eq.${params.uid}`);
    return json({ success: true, status: newStatus });
  } catch (e) { return err(e.message, e.status || 500); }
}




