import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    const orders = await sb.from('orders').select('*', `id=eq.${params.ordId}`);
    if (!orders?.length) return err('Commande introuvable', 404);
    const order = orders[0];
    if (order.buyer_id !== user.id && order.vendor_id !== user.id && user.role !== 'admin') return err('Accès refusé', 403);
    const type = new URL(request.url).searchParams.get('type') || 'buyer';
    // Générer un HTML simple (PDF côté client via jsPDF en fallback)
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facture ${order.id.slice(0,8)}</title>
<style>body{font-family:Arial;padding:40px;} h1{color:#1a1a2e;} table{width:100%;border-collapse:collapse;} td,th{border:1px solid #ddd;padding:8px;}</style>
</head><body>
<h1>NEXUS Market — Facture</h1>
<p><strong>N° commande :</strong> ${order.id}</p>
<p><strong>Date :</strong> ${new Date(order.created_at).toLocaleDateString('fr-FR')}</p>
<p><strong>Acheteur :</strong> ${order.buyer_name} — ${order.buyer_email}</p>
<p><strong>Vendeur :</strong> ${order.vendor_name}</p>
<table><thead><tr><th>Produit</th><th>Qté</th><th>Prix unit.</th><th>Total</th></tr></thead>
<tbody>${(order.products||[]).map(p=>`<tr><td>${p.name||p.id}</td><td>${p.qty||1}</td><td>${p.price||0} EUR</td><td>${(p.price||0)*(p.qty||1)} EUR</td></tr>`).join('')}</tbody>
</table>
<p style="text-align:right;font-size:1.2em"><strong>Total : ${order.total} EUR</strong></p>
</body></html>`;
    return new Response(html, { headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) { return err(e.message, 500); }
}








