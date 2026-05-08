import { CORS, options, json, err } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const { email, password } = await request.json();
    if (!email || !password) return err('Email et mot de passe requis', 400);

    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return err(data.error_description || 'Identifiants invalides', 401);

    // Récupérer le profil complet
    const profRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${data.user.id}&select=*`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
    });
    const profiles = await profRes.json();
    const profile = profiles?.[0] || {};

    return json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      user: { ...data.user, ...profile },
    });
  } catch (e) { return err(e.message, 500); }
}



