import { CORS, options, json, err, supabase, sendEmail } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const { email, password, name, role = 'buyer', avatar = '🛒', ...rest } = await request.json();
    if (!email || !password || !name) return err('Champs requis manquants', 400);
    if (password.length < 8) return err('Mot de passe trop court', 400);

    // Créer user via Supabase Auth Admin
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name, role, avatar } }),
    });
    const user = await res.json();
    if (!res.ok) return err(user.message || 'Erreur création compte', res.status);

    // Insérer profil
    const sb = supabase(env);
    await sb.from('profiles').upsert({ id: user.id, email, name, role, avatar, ...rest }, 'id');

    // Email de bienvenue
    await sendEmail(env, {
      to: email,
      subject: 'Bienvenue sur NEXUS Market !',
      html: `<h2>Bonjour ${name} !</h2><p>Votre compte NEXUS Market a été créé avec succès.</p>`,
    });

    return json({ success: true, userId: user.id }, 201);
  } catch (e) { return err(e.message, 500); }
}


