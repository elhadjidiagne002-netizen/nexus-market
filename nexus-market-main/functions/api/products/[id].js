import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  const id = params.id;

  try {
    if (request.method === 'GET') {
      const data = await sb.from('products').select('*', `id=eq.${id}`);
      if (!data?.length) return err('Produit introuvable', 404);
      return json(data[0]);
    }

    const [user, e] = await requireAuth(request, env);
    if (e) return e;

    if (request.method === 'PUT' || request.method === 'PATCH') {
      const body = await request.json();
      // Vérifier ownership
      const existing = await sb.from('products').select('vendor_id', `id=eq.${id}`);
      if (!existing?.length) return err('Produit introuvable', 404);
      if (existing[0].vendor_id !== user.id && user.role !== 'admin') return err('Accès refusé', 403);
      const updated = await sb.from('products').update(body, `id=eq.${id}`);
      return json(Array.isArray(updated) ? updated[0] : updated);
    }

    if (request.method === 'DELETE') {
      const existing = await sb.from('products').select('vendor_id', `id=eq.${id}`);
      if (!existing?.length) return err('Produit introuvable', 404);
      if (existing[0].vendor_id !== user.id && user.role !== 'admin') return err('Accès refusé', 403);
      await sb.from('products').delete(`id=eq.${id}`);
      return json({ success: true });
    }

    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}


