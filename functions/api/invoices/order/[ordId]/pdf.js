// Feature 23 : Factures PDF — HTML imprimable
import { options, err, supabase, requireAuth } from '../../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  const ordId = params?.ordId;
  if (!ordId) return err('ID commande manquant', 400);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const filter = user.role === 'admin' ? `id=eq.${ordId}`
      : `id=eq.${ordId}&or=(buyer_id.eq.${user.id},vendor_id.eq.${user.id})`;
    const orders = await sb.from('orders').select('*', filter);
    if (!orders?.length) return err('Commande introuvable', 404);
    const order = orders[0];
    const items = await sb.from('order_items').select('*', `order_id=eq.${ordId}`) || [];
    const buyerR  = await sb.from('profiles').select('name,email,phone,address', `id=eq.${order.buyer_id}`).catch(() => []);
    const vendorR = await sb.from('profiles').select('name,email,phone,address,ninea,rccm', `id=eq.${order.vendor_id}`).catch(() => []);
    const buyer  = buyerR?.[0]  || {};
    const vendor = vendorR?.[0] || {};
    const num    = `NXS-${ordId.slice(0,8).toUpperCase()}`;
    const subtotal = items.reduce((s,i) => s + ((i.unit_price||i.price||0)*(i.quantity||1)), 0);
    const fmt    = n => `${(n||0).toLocaleString('fr-FR')} FCFA`;
    const date   = new Date(order.created_at).toLocaleDateString('fr-FR', {year:'numeric',month:'long',day:'numeric'});
    const rows   = items.map(i =>
      `<tr><td>${i.product_name||i.name||'Article'}</td><td style="text-align:center">${i.quantity||1}</td>`+
      `<td style="text-align:right">${fmt(i.unit_price||i.price)}</td>`+
      `<td style="text-align:right"><strong>${fmt((i.unit_price||i.price||0)*(i.quantity||1))}</strong></td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Facture ${num}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a}
.page{max-width:800px;margin:0 auto;padding:40px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:20px;border-bottom:3px solid #00853E}
.logo{font-size:28px;font-weight:900;color:#00853E}.logo small{display:block;font-size:12px;font-weight:400;color:#666}
.inv-meta{text-align:right}.inv-meta h2{font-size:22px;color:#00853E}
.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:#d4edda;color:#155724}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:28px}
.party h3{font-size:11px;text-transform:uppercase;color:#00853E;letter-spacing:1px;margin-bottom:8px}
.party p{color:#444;line-height:1.6;font-size:12px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}thead{background:#00853E;color:white}
th{padding:10px 12px;text-align:left;font-size:12px}td{padding:10px 12px;border-bottom:1px solid #eee;font-size:12px}
.totals{margin-left:auto;width:280px}.t-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee}
.t-total{font-size:16px;font-weight:700;color:#00853E;border-top:2px solid #00853E;border-bottom:none;padding-top:10px}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #eee;text-align:center;color:#999;font-size:11px}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head>
<body><div class="page">
<div class="header"><div class="logo">NEXUS<small>Market Senegal</small></div>
<div class="inv-meta"><h2>FACTURE</h2><p><strong>${num}</strong></p><p>Date : ${date}</p><p>Statut : <span class="badge">Payee</span></p></div></div>
<div class="parties">
<div class="party"><h3>Vendeur</h3><p><strong>${vendor.name||'N/A'}</strong><br>${vendor.email||''}<br>${vendor.phone||''}<br>${vendor.address||''}${vendor.ninea?'<br>NINEA: '+vendor.ninea:''}</p></div>
<div class="party"><h3>Acheteur</h3><p><strong>${buyer.name||'N/A'}</strong><br>${buyer.email||''}<br>${buyer.phone||''}</p></div>
</div>
<table><thead><tr><th>Description</th><th style="text-align:center">Qte</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="totals"><div class="t-row"><span>Sous-total</span><span>${fmt(subtotal)}</span></div>
${order.shipping_fee>0?'<div class="t-row"><span>Livraison</span><span>'+fmt(order.shipping_fee)+'</span></div>':''}
<div class="t-row t-total"><span>TOTAL TTC</span><span>${fmt(order.total||subtotal)}</span></div></div>
<div class="footer"><p>NEXUS Market Senegal</p><p style="margin-top:4px">Genere le ${new Date().toLocaleDateString('fr-FR')}</p></div>
</div><script>if(location.search.includes('print=1'))window.print();</script></body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Invoice-Number': num } });
  } catch (e) { return err(e.message, e.status || 500); }
}