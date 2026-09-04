// functions/api/quotes/respond.js → POST /api/quotes/respond
// Un pro notifié répond à une demande de devis (prix + délai + message), ou
// décline explicitement (decline:true). Délégué à `respond_to_quote`.
import { json, err, options } from '../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  const apiKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY;
  if (!env.SUPABASE_URL || !apiKey) return err('Supabase non configuré', 503);

  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return err('Non authentifié', 401);
  const token = auth.replace('Bearer ', '');

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }

  const requestId = String(body?.request_id || '').trim();
  const decline = !!body?.decline;
  if (!requestId) return err('request_id requis', 400);
  if (!decline && !(Number(body?.price_fcfa) > 0)) return err('Prix requis', 400);

  const params = {
    p_request_id: requestId,
    p_price_fcfa: decline ? null : Number(body.price_fcfa),
    p_delay_text: body?.delay_text || null,
    p_message: body?.message || null,
    p_decline: decline,
  };

  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/respond_to_quote`, {
      method: 'POST',
      headers: { apikey: apiKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!r.ok) {
      if (r.status === 401) return err('Token expiré', 401);
      const text = await r.text().catch(() => '');
      return err('Erreur Supabase : ' + text.slice(0, 300), 502);
    }
    const data = await r.json().catch(() => null);
    if (!data || data.ok === false) {
      const reason = data?.reason || 'inconnue';
      const messages = {
        not_a_pro: "Vous n'avez pas de fiche NEXUS Pro active",
        request_closed: 'Cette demande est fermée ou expirée',
        not_notified: "Vous n'avez pas été notifié pour cette demande",
        price_required: 'Prix requis',
      };
      return err(messages[reason] || `Réponse impossible (${reason})`, 400);
    }
    return json(data);
  } catch (e) {
    return err('Réponse impossible : ' + (e.message || e), 502);
  }
}
