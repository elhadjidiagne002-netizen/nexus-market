import { CORS, options, json, err, supabase, sendEmail } from '../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const { email, password, name, company, jobTitle, ninea, rc, address, phone } = await request.json();
    if (!email || !password || !name) return err('Champs requis manquants', 400);
    const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const user = await authRes.json();
    if (!authRes.ok) return err(user.message || 'Erreur création compte', authRes.status);
    const sb = supabase(env);
    await sb.from('profiles').insert({ id: user.id, email, name, role: 'buyer_pro', status: 'active', company, job_title: jobTitle, ninea, rc, address, phone });
    await sendEmail(env, { to: email, subject: 'Compte Pro NEXUS activé', html: `<h2>Bienvenue ${name} !</h2><p>Votre compte professionnel NEXUS Market est actif.</p>` });
    return json({ success: true, userId: user.id }, 201);
  } catch (e) { return err(e.message, 500); }
}











