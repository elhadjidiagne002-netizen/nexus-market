// ─── Helpers partagés pour toutes les Cloudflare Functions ───────────────────

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export function options() {
  return new Response(null, { status: 204, headers: CORS });
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export function err(message, status = 400) {
  return json({ error: message }, status);
}

// ─── Client Supabase léger (REST) ────────────────────────────────────────────
export function supabase(env) {
  const url  = env.SUPABASE_URL;
  const key  = env.SUPABASE_SERVICE_KEY; // service_role — bypass RLS
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY manquants');

  const headers = (extra = {}) => ({
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra,
  });

  const req = (path, opts = {}) =>
    fetch(`${url}/rest/v1${path}`, { ...opts, headers: headers(opts.headers) })
      .then(async r => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw Object.assign(new Error(body?.message || r.statusText), { status: r.status, body });
        return body;
      });

  return {
    from: (table) => ({
      select:  (cols = '*', qs = '') => req(`/${table}?select=${cols}${qs ? '&' + qs : ''}`),
      insert:  (data)                 => req(`/${table}`, { method: 'POST', body: JSON.stringify(data) }),
      upsert:  (data, on = 'id')      => req(`/${table}?on_conflict=${on}`, { method: 'POST', body: JSON.stringify(data), headers: { Prefer: 'resolution=merge-duplicates,return=representation' } }),
      update:  (data, qs)             => req(`/${table}?${qs}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete:  (qs)                   => req(`/${table}?${qs}`, { method: 'DELETE' }),
      rpc:     (fn, params)           => req(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) }),
    }),
    auth: {
      getUser: (token) =>
        fetch(`${url}/auth/v1/user`, {
          headers: { apikey: key, Authorization: `Bearer ${token}` },
        }).then(r => r.json()),
    },
    rpc: (fn, params) => req(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) }),
  };
}

// ─── Vérification JWT ─────────────────────────────────────────────────────────
export async function requireAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return [null, err('Token manquant', 401)];

  try {
    const sb = supabase(env);
    const user = await sb.auth.getUser(token);
    if (user.error || !user.id) return [null, err('Token invalide', 401)];
    return [user, null];
  } catch (e) {
    return [null, err('Erreur auth: ' + e.message, 401)];
  }
}

export async function requireAdmin(request, env) {
  const [user, errResp] = await requireAuth(request, env);
  if (errResp) return [null, errResp];
  if (user.role !== 'admin' && user.user_metadata?.role !== 'admin') {
    // Double-check in profiles table
    try {
      const sb = supabase(env);
      const profiles = await sb.from('profiles').select('role', `id=eq.${user.id}`);
      if (!profiles?.[0] || profiles[0].role !== 'admin') {
        return [null, err('Accès réservé aux admins', 403)];
      }
      return [{ ...user, role: 'admin' }, null];
    } catch (e) {
      return [null, err('Erreur vérification rôle', 500)];
    }
  }
  return [user, null];
}

// ─── Pagination helper ────────────────────────────────────────────────────────
export function paginate(url) {
  const u = new URL(url);
  const page  = parseInt(u.searchParams.get('page')  || '1');
  const limit = parseInt(u.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;
  return { page, limit, offset, qs: `limit=${limit}&offset=${offset}` };
}

// ─── Envoyer un email via Resend ──────────────────────────────────────────────
export async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) return console.warn('[email] RESEND_API_KEY manquant');
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'NEXUS Market <noreply@nexus-market.com>', to, subject, html }),
  });
}
