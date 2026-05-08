import { CORS, options, json, err } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const { refreshToken } = await request.json();
    if (!refreshToken) return err('refreshToken manquant', 400);
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = await res.json();
    if (!res.ok) return err(data.error_description || 'Token invalide', 401);
    return json({ accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in });
  } catch (e) { return err(e.message, 500); }
}









