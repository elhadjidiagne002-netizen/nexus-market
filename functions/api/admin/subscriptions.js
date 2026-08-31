// functions/api/admin/subscriptions.js → /api/admin/subscriptions
// Suivi des abonnements/renouvellements (Supabase, Cloudflare, Resend, PayTech,
// nom de domaine, etc.) — table admin-éditable (sql/2026_08_30_admin_subscriptions_and_logs.sql),
// car aucune API de ces services n'expose de date de renouvellement réelle.
// Réservé admin. GET (liste) / POST (créer) / PATCH ?id= (modifier) / DELETE ?id=.
import { requireAdmin, supabase, err, json, options } from '../_lib/utils.js';

const WRITABLE_FIELDS = [
  'service_name', 'category', 'dashboard_url', 'notes', 'plan_name',
  'cost_amount', 'cost_currency', 'billing_cycle', 'renewal_date', 'status',
];

function pickWritable(body) {
  const out = {};
  for (const k of WRITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body || {}, k)) {
      // Chaîne vide → NULL (sinon Postgres rejette '' pour numeric/date : le
      // formulaire envoie '' quand un champ optionnel — coût, date — est laissé vide).
      const v = body[k];
      out[k] = v === '' ? null : v;
    }
  }
  return out;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  const [, errResp] = await requireAdmin(request, env);
  if (errResp) return errResp;

  const sb = supabase(env);
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  try {
    if (request.method === 'GET') {
      const rows = await sb.from('subscriptions').select('*', 'order=renewal_date.asc.nullslast');
      return json({ subscriptions: rows });
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const patch = pickWritable(body);
      if (!patch.service_name || !patch.service_name.trim()) {
        return err('service_name requis', 400);
      }
      const now = new Date().toISOString();
      const rows = await sb.from('subscriptions').insert({ ...patch, created_at: now, updated_at: now });
      return json({ subscription: Array.isArray(rows) ? rows[0] : rows }, 201);
    }

    if (request.method === 'PATCH') {
      if (!id) return err('?id= requis', 400);
      const body = await request.json().catch(() => ({}));
      const patch = pickWritable(body);
      patch.updated_at = new Date().toISOString();
      const rows = await sb.from('subscriptions').update(patch, `id=eq.${id}`);
      return json({ subscription: Array.isArray(rows) ? rows[0] : rows });
    }

    if (request.method === 'DELETE') {
      if (!id) return err('?id= requis', 400);
      await sb.from('subscriptions').delete(`id=eq.${id}`);
      return json({ ok: true });
    }

    return err('Méthode non supportée', 405);
  } catch (e) {
    // [FIX] 502 est intercepté par Cloudflare qui remplace le corps JSON par sa
    // propre page d'erreur HTML générique — utiliser 500 pour que l'erreur réelle
    // (ex. violation de contrainte CHECK sur billing_cycle) arrive au client.
    return err('Erreur abonnements: ' + e.message, 500);
  }
}
