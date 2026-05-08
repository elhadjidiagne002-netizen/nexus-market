import { CORS, options, json, err, supabase, requireAuth } from '../../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const { fromId } = await request.json();
    const sb = supabase(env);
    await sb.from('messages').update(
      { read: true, read_at: new Date().toISOString() },
      \`to_id=eq.\${user.id}&read=eq.false\${fromId ? \`&from_id=eq.\${fromId}\` : ''}\`
    );
    return json({ success: true });
  } catch (e) { return err(e.message, 500); }
}
