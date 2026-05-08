import { CORS, options, json, err, supabase, requireAdmin, sendEmail } from '../../../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const { approved, reason } = await request.json();
    const sb = supabase(env);
    const updated = await sb.from('products').update(
      { moderated: approved, active: approved },
      `id=eq.${params.id}`
    );
    const product = Array.isArray(updated) ? updated[0] : updated;

    // Notifier le vendeur
    if (product?.vendor_id) {
      const vendors = await sb.from('profiles').select('email,name', `id=eq.${product.vendor_id}`);
      if (vendors?.[0]) {
        await sb.from('notifications').insert({
          user_id: product.vendor_id,
          type: approved ? 'success' : 'warning',
          title: approved ? 'Produit approuvé' : 'Produit refusé',
          message: approved
            ? \`Votre produit "\${product.name}" est maintenant visible.\`
            : \`Votre produit "\${product.name}" a été refusé. Raison : \${reason || 'non précisée'}\`,
        });
      }
    }
    return json({ success: true, product });
  } catch (e) { return err(e.message, e.status || 500); }
}
