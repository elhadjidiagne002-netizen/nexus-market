// functions/api/rescue/create.js → POST /api/rescue/create
// Création d'un SOS dépannage AVEC rate-limit par IP (anti-abus). Le SOS anonyme
// passe désormais par ce endpoint (et non plus l'appel RPC direct), pour que la
// limite ne soit pas contournable. Appelle create_rescue_request en service key.
import { json, err, options, supabase } from '../_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from '../_lib/ratelimit.js';

// 5 SOS / 10 min / IP : large pour un usage légitime (urgence), bloque le spam.
const SOS_MAX = 5;
const SOS_WINDOW = 600;

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }

  const phone = String(body?.requester_phone || '').trim();
  const lat = Number(body?.location_lat);
  const lng = Number(body?.location_lng);
  if (!phone) return err('Téléphone requis', 400);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return err('Position requise', 400);

  // Rate-limit par IP (fail-open : si la base est indispo, on laisse passer).
  const ip = clientIp(request);
  const rl = await rateLimit(env, `sos:${ip}`, SOS_MAX, SOS_WINDOW);
  if (!rl.allowed) return tooManyRequests(rl.resetAt);

  // Payload transmis au RPC (le serveur fixe requester_id/phone depuis le body ;
  // requester_id null = demande anonyme). Montants recalculés côté client, mais on
  // ne fait pas confiance au client pour les identités — ici seul le flux SOS compte.
  const payload = {
    requester_id: body?.requester_id ? String(body.requester_id) : null,
    requester_name: body?.requester_name || null,
    requester_phone: phone,
    issue_type: body?.issue_type || 'breakdown',
    vehicle_info: body?.vehicle_info || null,
    description: body?.description || null,
    location_zone: body?.location_zone || null,
    location_label: body?.location_label || 'Position GPS',
    location_lat: lat,
    location_lng: lng,
    fee_fcfa: Number(body?.fee_fcfa) || 0,
    commission_fcfa: Number(body?.commission_fcfa) || 0,
    rescuer_payout: Number(body?.rescuer_payout) || 0,
    payment_method: body?.payment_method || 'cod',
  };

  try {
    const sb = supabase(env);
    const row = await sb.rpc('create_rescue_request', { payload });
    const d = Array.isArray(row) ? row[0] : row;
    if (!d || !d.id) return err('Création SOS impossible', 502);
    return json(d);
  } catch (e) {
    return err('Création SOS impossible : ' + (e.message || e), 502);
  }
}
