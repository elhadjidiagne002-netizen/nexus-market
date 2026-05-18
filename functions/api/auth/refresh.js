/**
 * POST /api/auth/refresh
 * Rafraîchit un access_token Supabase à partir d'un refresh_token.
 * Permet d'éviter que les sessions cassent à ~15 min.
 *
 * Body : { refresh_token: "..." }
 * Réponse : { access_token, refresh_token, expires_in }
 *
 * Variables d'env : SUPABASE_URL, SUPABASE_ANON_KEY (la anon suffit ici)
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'Supabase non configuré' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON invalide' }, 400);
  }

  const { refresh_token } = body;
  if (!refresh_token) {
    return json({ error: 'refresh_token manquant' }, 400);
  }

  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token })
      }
    );

    const data = await res.json();
    if (!res.ok) {
      return json({ error: data.error_description || data.msg || 'Refresh échoué' }, res.status);
    }

    return json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
      user: data.user
    });
  } catch (e) {
    return json({ error: 'Supabase Auth injoignable', detail: e.message }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
