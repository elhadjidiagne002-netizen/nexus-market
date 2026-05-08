import { CORS, options, json, err, supabase, requireAuth } from '../../../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    if (request.method === 'GET') {
      const data = await sb.from('product_qa').select('*', `product_id=eq.${params.id}&order=created_at.asc`);
      return json(data || []);
    }
    if (request.method === 'POST') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      const { question } = await request.json();
      if (!question?.trim()) return err('Question vide', 400);
      // Trouver le vendor_id du produit
      const products = await sb.from('products').select('vendor_id', `id=eq.${params.id}`);
      const vendor_id = products?.[0]?.vendor_id || null;
      const data = await sb.from('product_qa').insert({
        product_id: params.id, user_id: user.id, user_name: user.name || user.email,
        vendor_id, question: question.trim(),
      });
      // Notifier le vendeur
      if (vendor_id) {
        await sb.from('notifications').insert({
          user_id: vendor_id, type: 'info', title: 'Nouvelle question',
          message: \`Un client a posé une question sur un de vos produits.\`,
          link: \`/products/\${params.id}\`,
        }).catch(() => {});
      }
      return json(Array.isArray(data) ? data[0] : data, 201);
    }
    if (request.method === 'PATCH') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      const { qaId, answer } = await request.json();
      const updated = await sb.from('product_qa').update(
        { answer, answered_at: new Date().toISOString() },
        `id=eq.${qaId}&vendor_id=eq.${user.id}`
      );
      return json(Array.isArray(updated) ? updated[0] : updated);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
