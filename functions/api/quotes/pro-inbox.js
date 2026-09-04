// functions/api/quotes/pro-inbox.js → GET /api/quotes/pro-inbox
// Liste les demandes de devis reçues par le pro connecté (sa fiche pros),
// avec sa propre réponse le cas échéant. RLS scope déjà à
// pro_id IN (pros du user), JWT forward suffit.
import { json, err, options } from '../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'GET') return err('GET requis', 405);

  const apiKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY;
  if (!env.SUPABASE_URL || !apiKey) return err('Supabase non configuré', 503);

  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return err('Non authentifié', 401);
  const token = auth.replace('Bearer ', '');

  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/quote_responses?select=*,request:quote_requests(*)&order=created_at.desc`,
      { headers: { apikey: apiKey, Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) {
      if (r.status === 401) return err('Token expiré', 401);
      const text = await r.text().catch(() => '');
      return err('Erreur Supabase : ' + text.slice(0, 300), 502);
    }
    const data = await r.json().catch(() => []);
    return json({ ok: true, notifications: data });
  } catch (e) {
    return err('Lecture impossible : ' + (e.message || e), 502);
  }
}
