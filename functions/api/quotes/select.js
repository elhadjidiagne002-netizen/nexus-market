// functions/api/quotes/select.js → POST /api/quotes/select
// Le buyer choisit une réponse chiffrée — ferme la demande, notifie le pro
// retenu. Délégué à `select_quote_response`.
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
  const responseId = String(body?.response_id || '').trim();
  if (!requestId || !responseId) return err('request_id et response_id requis', 400);

  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/select_quote_response`, {
      method: 'POST',
      headers: { apikey: apiKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_request_id: requestId, p_response_id: responseId }),
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
        not_your_request_or_closed: 'Demande introuvable ou déjà fermée',
        response_not_found: 'Devis introuvable',
      };
      return err(messages[reason] || `Sélection impossible (${reason})`, 400);
    }
    return json(data);
  } catch (e) {
    return err('Sélection impossible : ' + (e.message || e), 502);
  }
}
