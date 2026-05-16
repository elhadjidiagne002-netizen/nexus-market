// functions/api/flash-sales/index.js — Feature 19 : Flash sales + coupons
// GET  /api/flash-sales           → flash sales actives (public)
// POST /api/flash-sales           → créer une flash sale (admin/vendor)
// GET  /api/flash-sales?id=xxx    → détail avec compte à rebours
import { options, json, err, supabase, requireAuth, requireAdmin } from '../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);

  try {
    if (request.method === 'GET') {
      const url   = new URL(request.url);
      const id    = url.searchParams.get('id');
      const now   = new Date().toISOString();
      const page  = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
      const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '20'));

      if (id) {
        // Détail d'une flash sale
        const data = await sb.from('flash_sales').select('*', `id=eq.${id}`);
        if (!data?.length) return err('Flash sale introuvable', 404);
        const sale = data[0];
        return json({
          ...sale,
          time_left_ms:  new Date(sale.ends_at).getTime() - Date.now(),
          is_active:     sale.active && new Date() >= new Date(sale.starts_at) && new Date() <= new Date(sale.ends_at),
          remaining_uses: sale.max_uses ? sale.max_uses - (sale.current_uses || 0) : null,
        });
      }

      // Liste des flash sales actives
      const data = await sb.from('flash_sales').select(
        '*',
        `active=eq.true&starts_at=lte.${now}&ends_at=gte.${now}&order=ends_at.asc&limit=${limit}&offset=${(page-1)*limit}`
      );

      return json({
        sales: (data || []).map(s => ({
          ...s,
          time_left_ms:   new Date(s.ends_at).getTime() - Date.now(),
          remaining_uses: s.max_uses ? s.max_uses - (s.current_uses || 0) : null,
        })),
        page, limit,
      });
    }

    if (request.method === 'POST') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      if (!['admin','vendor'].includes(user.role)) return err('Accès refusé', 403);

      const body = await request.json().catch(() => ({}));
      const { productId, title, discountPercent, startsAt, endsAt, maxUses } = body;

      if (!productId || !discountPercent || !endsAt) return err('productId, discountPercent et endsAt requis', 400);
      if (discountPercent < 1 || discountPercent > 99) return err('discountPercent doit être entre 1 et 99', 400);

      const starts = startsAt || new Date().toISOString();
      if (new Date(starts) >= new Date(endsAt)) return err('startsAt doit être avant endsAt', 400);

      // Vérifier que le produit appartient au vendeur
      if (user.role === 'vendor') {
        const products = await sb.from('products').select('id', `id=eq.${productId}&vendor_id=eq.${user.id}`);
        if (!products?.length) return err('Produit introuvable ou non autorisé', 403);
      }

      const sale = await sb.from('flash_sales').insert({
        product_id:       productId,
        vendor_id:        user.id,
        title:            title || `Flash Sale -${discountPercent}%`,
        discount_percent: discountPercent,
        discount:         discountPercent,   // compatibilité avec l'ancien champ
        starts_at:        starts,
        ends_at:          endsAt,
        max_uses:         maxUses || null,
        current_uses:     0,
        active:           true,
        created_at:       new Date().toISOString(),
      });

      return json(Array.isArray(sale) ? sale[0] : sale, 201);
    }

    // PATCH — désactiver une flash sale
    if (request.method === 'PATCH') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;

      const url  = new URL(request.url);
      const id   = url.searchParams.get('id');
      if (!id) return err('id requis', 400);

      const { active } = await request.json().catch(() => ({}));
      const filter = user.role === 'admin' ? `id=eq.${id}` : `id=eq.${id}&vendor_id=eq.${user.id}`;

      const updated = await sb.from('flash_sales').update({ active }, filter);
      return json(Array.isArray(updated) ? updated[0] : { ok: true });
    }

    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
