// functions/api/quotes/create.js → POST /api/quotes/create
// Crée une demande de devis chantier (NEXUS Pro) et déclenche la notification
// des pros les plus proches — délégué à la RPC `create_quote_request` (voir
// sql/2026_09_04_devis_chantier.sql). JWT user forward vers PostgREST (comme
// orders/[id]/status.js) : Supabase applique la RLS avec auth.uid() = le buyer,
// pas de service key ici (auth.uid() serait NULL avec la service key).
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

  const profession = String(body?.profession || '').trim();
  const description = String(body?.description || '').trim();
  if (!profession) return err('Métier requis', 400);
  if (!description) return err('Description requise', 400);

  const payload = {
    profession,
    description,
    photo_url: body?.photo_url || null,
    budget_fcfa: body?.budget_fcfa != null ? Number(body.budget_fcfa) : null,
    city: body?.city || null,
    location_lat: body?.location_lat != null ? Number(body.location_lat) : null,
    location_lng: body?.location_lng != null ? Number(body.location_lng) : null,
  };

  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/create_quote_request`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload }),
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
        profession_required: 'Métier requis',
        no_pro_for_profession: 'Aucun professionnel actif pour ce métier pour le moment',
      };
      return err(messages[reason] || `Création impossible (${reason})`, 400);
    }
    return json(data);
  } catch (e) {
    return err('Création impossible : ' + (e.message || e), 502);
  }
}
