// functions/api/quotes/cancel.js → POST /api/quotes/cancel
// Le buyer annule sa demande de devis. Délégué à `cancel_quote_request`.
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
  if (!requestId) return err('request_id requis', 400);

  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cancel_quote_request`, {
      method: 'POST',
      headers: { apikey: apiKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_request_id: requestId }),
    });
    if (!r.ok) {
      if (r.status === 401) return err('Token expiré', 401);
      const text = await r.text().catch(() => '');
      return err('Erreur Supabase : ' + text.slice(0, 300), 502);
    }
    const data = await r.json().catch(() => null);
    if (!data || data.ok === false) return err('Annulation impossible (demande introuvable ou déjà traitée)', 400);
    return json(data);
  } catch (e) {
    return err('Annulation impossible : ' + (e.message || e), 502);
  }
}
