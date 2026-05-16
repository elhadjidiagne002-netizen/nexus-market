// Feature 19 : Flash sales — CRUD complet
import { options, json, err, supabase, requireAuth } from '../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    const url  = new URL(request.url);
    const now  = new Date().toISOString();
    if (request.method === 'GET') {
      const id    = url.searchParams.get('id');
      const page  = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
      const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '20'));
      if (id) {
        const data = await sb.from('flash_sales').select('*', `id=eq.${id}`);
        if (!data?.length) return err('Flash sale introuvable', 404);
        const s = data[0];
        return json({ ...s, time_left_ms: new Date(s.ends_at).getTime() - Date.now(),
          remaining_uses: s.max_uses ? s.max_uses - (s.current_uses || 0) : null,
          is_active: s.active && new Date() >= new Date(s.starts_at) && new Date() <= new Date(s.ends_at) });
      }
      const data = await sb.from('flash_sales').select('*',
        `active=eq.true&starts_at=lte.${now}&ends_at=gte.${now}&order=ends_at.asc&limit=${limit}&offset=${(page-1)*limit}`);
      return json({ sales: (data||[]).map(s => ({ ...s,
        time_left_ms: new Date(s.ends_at).getTime() - Date.now(),
        remaining_uses: s.max_uses ? s.max_uses - (s.current_uses||0) : null })), page, limit });
    }
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (request.method === 'POST') {
      if (!['admin','vendor'].includes(user.role)) return err('Accès refusé', 403);
      const { productId, title, discountPercent, discount, startsAt, endsAt, maxUses } = await request.json().catch(() => ({}));
      const pct = discountPercent || discount;
      if (!productId || !pct || !endsAt) return err('productId, discountPercent et endsAt requis', 400);
      if (pct < 1 || pct > 99) return err('discountPercent entre 1 et 99', 400);
      const starts = startsAt || now;
      if (new Date(starts) >= new Date(endsAt)) return err('startsAt doit être avant endsAt', 400);
      if (user.role === 'vendor') {
        const prods = await sb.from('products').select('id', `id=eq.${productId}&vendor_id=eq.${user.id}`);
        if (!prods?.length) return err('Produit non autorisé', 403);
      }
      const sale = await sb.from('flash_sales').insert({
        product_id: productId, vendor_id: user.id,
        title: title || `Flash Sale -${pct}%`, discount_percent: pct, discount: pct,
        starts_at: starts, ends_at: endsAt, max_uses: maxUses || null,
        current_uses: 0, active: true, created_at: now,
      });
      return json(Array.isArray(sale) ? sale[0] : sale, 201);
    }
    if (request.method === 'PATCH') {
      const id = url.searchParams.get('id');
      if (!id) return err('id requis', 400);
      const { active } = await request.json().catch(() => ({}));
      const filter = user.role === 'admin' ? `id=eq.${id}` : `id=eq.${id}&vendor_id=eq.${user.id}`;
      await sb.from('flash_sales').update({ active }, filter);
      return json({ ok: true });
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
