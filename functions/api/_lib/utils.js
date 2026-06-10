// functions/api/_lib/utils.js
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

export function supabase(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
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

// requireAuth — lookup par EMAIL pour eviter mismatch id auth vs profiles
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
  try {
    const sb = supabase(env);
    // Lookup par email — robuste meme si l'id du profil differe de auth.users
    const profiles = await sb.from('profiles').select('role', `email=eq.${encodeURIComponent(user.email)}`);
    if (!profiles?.[0] || profiles[0].role !== 'admin') {
      return [null, err('Acces reserve aux admins', 403)];
    }
    return [{ ...user, role: 'admin' }, null];
  } catch (e) {
    return [null, err('Erreur verification role: ' + e.message, 500)];
  }
}

// ── Anti-fraude paiement ─────────────────────────────────────────────────────
// Borne le montant envoyé par le client au total RÉEL des commandes lues en base
// (source autoritaire). Bloque le sous-paiement (ex : payer 1 000 FCFA pour une
// commande de 500 000) tout en tolérant les remises légitimes (coupon, points,
// cashback…) jusqu'à PAY_MAX_DISCOUNT (défaut 60 %). Vérifie aussi que les
// commandes appartiennent à l'acheteur authentifié et ne sont pas déjà payées.
//   amountEur : montant demandé par le client, converti en EUR (devise de orders.total).
// Retour : { ok:true, expectedEur } | { ok:false, status, error }
export async function validatePaymentAmount(env, { orderIds, uid, amountEur }) {
  const ids = Array.from(new Set((orderIds || []).filter(Boolean).map(String)));
  if (!ids.length) return { ok: false, status: 400, error: 'order_id(s) requis' };

  let rows;
  try {
    const sb = supabase(env);
    const inList = ids.map(encodeURIComponent).join(',');
    rows = await sb.from('orders').select('id,total,buyer_id,payment_status', `id=in.(${inList})`);
  } catch (e) {
    return { ok: false, status: 502, error: 'Lecture des commandes impossible' };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, status: 404, error: 'Commande introuvable' };
  }

  for (const o of rows) {
    // Ownership : si buyer_id est renseigné, il doit correspondre à l'utilisateur.
    if (o.buyer_id && uid && o.buyer_id !== uid) {
      return { ok: false, status: 403, error: 'Commande non autorisée' };
    }
    // Anti-rejeu : on ne ré-initie pas un paiement sur une commande déjà payée.
    if (o.payment_status === 'paid') {
      return { ok: false, status: 409, error: 'Commande déjà payée' };
    }
  }

  const expectedEur = rows.reduce((s, o) => s + (Number(o.total) || 0), 0);
  if (expectedEur <= 0) {
    // Total inconnu/0 en base → impossible de borner. On journalise plutôt que de
    // bloquer un checkout légitime, mais c'est un signal à investiguer.
    console.warn('[pay] total commande nul/inconnu — montant non borné', ids);
    return { ok: true, expectedEur: 0 };
  }

  const maxDisc = Math.min(0.95, Math.max(0, parseFloat(env.PAY_MAX_DISCOUNT || '0.6')));
  const floor = expectedEur * (1 - maxDisc);
  const ceil  = expectedEur * 1.005; // +0,5 % de tolérance (arrondis / taux de change)
  if (amountEur > ceil)  return { ok: false, status: 400, error: 'Montant supérieur au total de la commande' };
  if (amountEur < floor) return { ok: false, status: 400, error: 'Montant inférieur au total dû' };
  return { ok: true, expectedEur };
}

export function paginate(url) {
  const u = new URL(url);
  const page  = parseInt(u.searchParams.get('page')  || '1');
  const limit = parseInt(u.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;
  return { page, limit, offset, qs: `limit=${limit}&offset=${offset}` };
}

export async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) return console.warn('[email] RESEND_API_KEY manquant');
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'NEXUS Market <noreply@nexus-market.com>', to, subject, html }),
  });
}
