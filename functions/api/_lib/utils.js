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

// [SEC] Authentifie un appel SERVEUR→SERVEUR (webhooks, cron) par un secret
// d'en-tête JAMAIS exposé au navigateur. À utiliser quand un endpoint doit
// accepter à la fois des appels internes (sans JWT) et des appels client (JWT).
// Secret : env.INTERNAL_API_SECRET (recommandé) ou repli sur env.CRON_SECRET.
export function isInternalCall(request, env) {
  const provided = request.headers.get('X-Internal-Secret') || '';
  // Repli robuste sur SUPABASE_SERVICE_KEY : TOUJOURS configurée côté serveur
  // (ces functions en ont besoin) et JAMAIS exposée au client (seul l'anon key
  // est dans le bundle). Évite que le push/WhatsApp interne casse quand ni
  // INTERNAL_API_SECRET ni CRON_SECRET ne sont définis.
  // [FIX] Accepter N'IMPORTE LEQUEL des secrets internes configurés (tous server-only) :
  // sinon, dès que CRON_SECRET est défini, lui seul est attendu et les appelants
  // envoyant la SERVICE KEY (ex. trigger DB push) renvoient 401.
  const accepted = [env.INTERNAL_API_SECRET, env.CRON_SECRET, env.SUPABASE_SERVICE_KEY].filter(Boolean);
  return !!provided && accepted.includes(provided);
}

// Valeur à envoyer dans l'en-tête X-Internal-Secret par les appelants internes.
export function internalSecret(env) {
  return env.INTERNAL_API_SECRET || env.CRON_SECRET || env.SUPABASE_SERVICE_KEY || '';
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

  // [SEC] Bornes du montant (logique pure extraite → testable, cf. paymentAmountBounds).
  const bounds = paymentAmountBounds({
    amountEur, expectedEur,
    maxDisc: parseFloat(env.PAY_MAX_DISCOUNT || '0.6'),
    feeTolEur: parseFloat(env.PAY_FEE_TOLERANCE_EUR || '2'),
  });
  if (!bounds.ok && bounds.reason === 'over') {
    console.warn('[pay] montant > plafond toléré (frais/arrondis ?)', { amountEur, expectedEur, ceil: bounds.ceil });
    return { ok: false, status: 400, error: 'Montant supérieur au total de la commande' };
  }
  if (!bounds.ok && bounds.reason === 'under') {
    return { ok: false, status: 400, error: 'Montant inférieur au total dû' };
  }
  return { ok: true, expectedEur };
}

// [SEC] Bornes PURES du montant payé (aucune I/O → testable unitairement) :
//  - plancher = total × (1 − maxDisc) : bloque le SOUS-paiement (vecteur de fraude).
//  - plafond  = total × 1.02 + feeTolEur : tolère frais de suivi + arrondis EUR↔XOF
//    (le sur-paiement n'est pas une fraude contre la plateforme).
// maxDisc borné à [0, 0.95], feeTolEur ≥ 0.
// Retour : { ok:true, floor, ceil } | { ok:false, reason:'under'|'over', floor, ceil }
export function paymentAmountBounds({ amountEur, expectedEur, maxDisc = 0.6, feeTolEur = 2 }) {
  const md = Math.min(0.95, Math.max(0, Number(maxDisc) || 0));
  const ft = Math.max(0, Number(feeTolEur) || 0);
  const floor = expectedEur * (1 - md);
  const ceil = expectedEur * 1.02 + ft;
  if (amountEur > ceil) return { ok: false, reason: 'over', floor, ceil };
  if (amountEur < floor) return { ok: false, reason: 'under', floor, ceil };
  return { ok: true, floor, ceil };
}

// [BOOST] Valide le montant d'un paiement de boost contre le tarif CANONIQUE
// (app_config → nexus_monetization_cfg, éditable par l'admin), et non contre le
// price_fcfa inséré côté client (qu'un vendeur pourrait falsifier à 1 FCFA).
// amountXof : montant demandé (FCFA, entier). Retour { ok, status, error, boost }.
const BOOST_PRICE_KEYS = {
  top_3j:        'boost_top3j_price',
  boost_semaine: 'boost_semaine_price',
  boost_mensuel: 'boost_mensuel_price',
  pro_mensuel:   'boost_mensuel_price',
  category_top:  'boost_cat_price',
};
const BOOST_PRICE_DEFAULTS = {
  boost_top3j_price: 500, boost_semaine_price: 1200, boost_mensuel_price: 8000, boost_cat_price: 2000,
};

export async function validateBoostAmount(env, { boostId, uid, amountXof }) {
  if (!boostId) return { ok: false, status: 400, error: 'boost_id requis' };
  const sb = supabase(env);
  let row;
  try {
    const rows = await sb.from('product_boosts').select(
      'id,vendor_id,price_fcfa,boost_type,payment_status',
      `id=eq.${encodeURIComponent(boostId)}`
    );
    row = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    return { ok: false, status: 502, error: 'Lecture du boost impossible' };
  }
  if (!row) return { ok: false, status: 404, error: 'Boost introuvable' };
  if (row.vendor_id && uid && row.vendor_id !== uid) {
    return { ok: false, status: 403, error: 'Boost non autorisé' };
  }
  if (row.payment_status === 'paid') return { ok: false, status: 409, error: 'Boost déjà payé' };

  // Tarif canonique = config admin (sinon défaut). On NE fait PAS confiance au
  // price_fcfa du client.
  let cfg = {};
  try {
    const c = await sb.from('app_config').select('value', `key=eq.nexus_monetization_cfg`);
    cfg = (Array.isArray(c) && c[0] && c[0].value) || {};
  } catch (_) {}
  const key = BOOST_PRICE_KEYS[row.boost_type];
  const canonical = key
    ? (cfg[key] != null ? Number(cfg[key]) : BOOST_PRICE_DEFAULTS[key])
    : null;

  const amt = Math.round(Number(amountXof));
  if (canonical != null && canonical > 0) {
    if (amt !== canonical) return { ok: false, status: 400, error: 'Montant ne correspond pas au tarif officiel du boost' };
  } else {
    // Type inconnu → repli prudent : montant = price_fcfa stocké, ≥ 100 FCFA.
    const stored = Number(row.price_fcfa) || 0;
    if (stored < 100 || amt !== stored) return { ok: false, status: 400, error: 'Montant de boost invalide' };
  }
  return { ok: true, boost: row };
}

// [BOUTIQUE PRO] Valide le montant d'un abonnement vendeur contre le tarif
// CANONIQUE (app_config → nexus_monetization_cfg), pas le price_fcfa client.
const PRO_PRICE_KEYS = { pro_mensuel: 'pro_mensuel_price', pro_annuel: 'pro_annuel_price' };
const PRO_PRICE_DEFAULTS = { pro_mensuel_price: 8000, pro_annuel_price: 80000 };

export async function validateProSubscription(env, { subId, uid, amountXof }) {
  if (!subId) return { ok: false, status: 400, error: 'sub_id requis' };
  const sb = supabase(env);
  let row;
  try {
    const rows = await sb.from('vendor_subscriptions').select(
      'id,vendor_id,plan,price_fcfa,payment_status', `id=eq.${encodeURIComponent(subId)}`);
    row = Array.isArray(rows) ? rows[0] : null;
  } catch (e) { return { ok: false, status: 502, error: 'Lecture abonnement impossible' }; }
  if (!row) return { ok: false, status: 404, error: 'Abonnement introuvable' };
  if (row.vendor_id && uid && row.vendor_id !== uid) return { ok: false, status: 403, error: 'Abonnement non autorisé' };
  if (row.payment_status === 'paid') return { ok: false, status: 409, error: 'Abonnement déjà payé' };

  let cfg = {};
  try {
    const c = await sb.from('app_config').select('value', `key=eq.nexus_monetization_cfg`);
    cfg = (Array.isArray(c) && c[0] && c[0].value) || {};
  } catch (_) {}
  const key = PRO_PRICE_KEYS[row.plan];
  const canonical = key ? (cfg[key] != null ? Number(cfg[key]) : PRO_PRICE_DEFAULTS[key]) : null;
  if (!(canonical > 0)) return { ok: false, status: 400, error: 'Plan Pro inconnu' };
  if (Math.round(Number(amountXof)) !== canonical) {
    return { ok: false, status: 400, error: 'Montant ne correspond pas au tarif de l’abonnement' };
  }
  return { ok: true, sub: row };
}

// [STORY PAYANTE] Valide le montant de publication d'une story contre le tarif
// CANONIQUE (app_config -> nexus_monetization_cfg.story_fee) + l'appartenance.
export async function validateStoryFee(env, { storyId, uid, amountXof }) {
  if (!storyId) return { ok: false, status: 400, error: 'story_id requis' };
  const sb = supabase(env);
  let row;
  try {
    const rows = await sb.from('stories').select('id,vendor_id,status', `id=eq.${encodeURIComponent(storyId)}`);
    row = Array.isArray(rows) ? rows[0] : null;
  } catch (e) { return { ok: false, status: 502, error: 'Lecture story impossible' }; }
  if (!row) return { ok: false, status: 404, error: 'Story introuvable' };
  if (row.vendor_id && uid && row.vendor_id !== uid) return { ok: false, status: 403, error: 'Story non autorisée' };
  if (row.status === 'active') return { ok: false, status: 409, error: 'Story déjà publiée' };

  let cfg = {};
  try {
    const c = await sb.from('app_config').select('value', `key=eq.nexus_monetization_cfg`);
    cfg = (Array.isArray(c) && c[0] && c[0].value) || {};
  } catch (_) {}
  const canonical = cfg.story_fee != null ? Math.round(Number(cfg.story_fee)) : 0;
  if (!(canonical > 0)) return { ok: false, status: 400, error: 'Publication gratuite — aucun paiement requis' };
  if (Math.round(Number(amountXof)) !== canonical) return { ok: false, status: 400, error: 'Montant ne correspond pas au tarif de publication' };
  return { ok: true, story: row };
}

// [FLASH] Montant d'une vente flash sponsorisée == price_fcfa stocké (et ce prix
// doit être l'un des tarifs flash configurés) + appartenance + non payée.
export async function validateFlashSale(env, { flashId, uid, amountXof }) {
  if (!flashId) return { ok: false, status: 400, error: 'flash_id requis' };
  const sb = supabase(env);
  let row;
  try {
    const rows = await sb.from('flash_sales').select('id,vendor_id,created_by,price_fcfa,payment_status', `id=eq.${encodeURIComponent(flashId)}`);
    row = Array.isArray(rows) ? rows[0] : null;
  } catch { return { ok: false, status: 502, error: 'Lecture flash impossible' }; }
  if (!row) return { ok: false, status: 404, error: 'Vente flash introuvable' };
  const owner = row.vendor_id || row.created_by;
  if (owner && uid && owner !== uid) return { ok: false, status: 403, error: 'Vente flash non autorisée' };
  if (row.payment_status === 'paid') return { ok: false, status: 409, error: 'Vente flash déjà payée' };
  let cfg = {};
  try { const c = await sb.from('app_config').select('value', `key=eq.nexus_monetization_cfg`); cfg = (Array.isArray(c) && c[0] && c[0].value) || {}; } catch (_) {}
  const flashPrices = [cfg.flash_12h_price, cfg.flash_24h_price, cfg.flash_48h_price, cfg.flash_7j_price].map(Number).filter(n => n > 0);
  const stored = Math.round(Number(row.price_fcfa) || 0);
  const amt = Math.round(Number(amountXof));
  if (amt !== stored || (flashPrices.length && !flashPrices.includes(stored))) return { ok: false, status: 400, error: 'Montant de vente flash invalide' };
  return { ok: true, flash: row };
}

// [B2B] Paiement du traitement PRIORITAIRE d'un devis B2B.
export async function validateB2bPriority(env, { quoteId, uid, amountXof }) {
  if (!quoteId) return { ok: false, status: 400, error: 'quote_id requis' };
  const sb = supabase(env);
  let row;
  try {
    const rows = await sb.from('b2b_quotes').select('id,buyer_id,priority_price,priority_payment_status', `id=eq.${encodeURIComponent(quoteId)}`);
    row = Array.isArray(rows) ? rows[0] : null;
  } catch { return { ok: false, status: 502, error: 'Lecture devis impossible' }; }
  if (!row) return { ok: false, status: 404, error: 'Devis introuvable' };
  if (row.buyer_id && uid && row.buyer_id !== uid) return { ok: false, status: 403, error: 'Devis non autorisé' };
  if (row.priority_payment_status === 'paid') return { ok: false, status: 409, error: 'Priorité déjà payée' };
  let cfg = {};
  try { const c = await sb.from('app_config').select('value', `key=eq.nexus_monetization_cfg`); cfg = (Array.isArray(c) && c[0] && c[0].value) || {}; } catch (_) {}
  const canonical = Math.round(Number(row.priority_price || cfg.b2b_priority_price || 2000));
  if (!(canonical > 0)) return { ok: false, status: 400, error: 'Tarif priorité B2B inconnu' };
  if (Math.round(Number(amountXof)) !== canonical) return { ok: false, status: 400, error: 'Montant ne correspond pas au tarif priorité' };
  return { ok: true, quote: row };
}

// [TRANSPORT] Paiement d'une réservation de places de covoiturage ou d'un
// colis rattaché à un trajet (transport_reservations). Le montant ne doit
// JAMAIS être celui envoyé par le client : on relit price_fcfa en base
// (calculé côté serveur par le RPC book_transport_seats, ou fixé par le
// transporteur à l'acceptation d'un colis).
export async function validateTransportBooking(env, { bookingId, uid, amountXof }) {
  if (!bookingId) return { ok: false, status: 400, error: 'booking_id requis' };
  const sb = supabase(env);
  let row;
  try {
    const rows = await sb.from('transport_reservations').select(
      'id,requester_id,price_fcfa,status,payment_status,booking_type',
      `id=eq.${encodeURIComponent(bookingId)}`
    );
    row = Array.isArray(rows) ? rows[0] : null;
  } catch { return { ok: false, status: 502, error: 'Lecture réservation impossible' }; }
  if (!row) return { ok: false, status: 404, error: 'Réservation introuvable' };
  if (row.requester_id && uid && row.requester_id !== uid) {
    return { ok: false, status: 403, error: 'Réservation non autorisée' };
  }
  if (row.payment_status === 'paid') return { ok: false, status: 409, error: 'Réservation déjà payée' };
  if (row.booking_type === 'package' && row.status !== 'pending_payment') {
    return { ok: false, status: 409, error: 'Colis pas encore accepté/prix fixé par le transporteur' };
  }
  if (!(Number(row.price_fcfa) > 0)) return { ok: false, status: 400, error: 'Montant de réservation invalide' };
  if (Math.round(Number(amountXof)) !== Math.round(Number(row.price_fcfa))) {
    return { ok: false, status: 400, error: 'Montant ne correspond pas au prix de la réservation' };
  }
  return { ok: true, reservation: row };
}

export function paginate(url) {
  const u = new URL(url);
  const page  = parseInt(u.searchParams.get('page')  || '1');
  const limit = parseInt(u.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;
  return { page, limit, offset, qs: `limit=${limit}&offset=${offset}` };
}

// Envoi d'email avec REDONDANCE : Resend (primaire) -> Brevo (secours).
// Retourne une Response (r.ok = succès) ou null si aucun fournisseur/échec total.
export async function sendEmail(env, { to, subject, html }) {
  const from = env.EMAIL_FROM || 'NEXUS Market <nx@nexusmarket.sn>';
  // 1) Resend (primaire)
  if (env.RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (r.ok) return r;
      console.warn('[email] Resend HTTP ' + r.status + ' -> bascule Brevo');
    } catch (e) { console.warn('[email] Resend KO:', e.message, '-> bascule Brevo'); }
  }
  // 2) Brevo (secours) — sender "Nom <email>" -> {name,email}
  if (env.BREVO_API_KEY) {
    const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
    const sender = m ? { name: (m[1] || 'NEXUS Market').trim(), email: m[2].trim() } : { name: 'NEXUS Market', email: from };
    try {
      return await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
      });
    } catch (e) { console.warn('[email] Brevo KO:', e.message); }
  }
  console.warn('[email] aucun fournisseur email configure (RESEND_API_KEY / BREVO_API_KEY)');
  return null;
}
