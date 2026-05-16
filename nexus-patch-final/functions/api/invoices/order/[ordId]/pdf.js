// functions/api/invoices/order/[ordId]/pdf.js — Feature 23 : Factures PDF
// GET /api/invoices/order/:ordId/pdf → HTML imprimable (ou PDF via API externe)
import { options, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  const ordId = params?.ordId;
  if (!ordId) return err('ID commande manquant', 400);

  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;

    // Vérifier l'accès
    const filter = user.role === 'admin'
      ? `id=eq.${ordId}`
      : `id=eq.${ordId}&or=(buyer_id.eq.${user.id},vendor_id.eq.${user.id})`;

    const orders = await sb.from('orders').select('*', filter);
    if (!orders?.length) return err('Commande introuvable', 404);
    const order = orders[0];

    // Lignes de commande
    const items = await sb.from('order_items').select('*', `order_id=eq.${ordId}`) || [];

    // Profils
    const buyerRes  = await sb.from('profiles').select('name,email,phone,address', `id=eq.${order.buyer_id}`).catch(() => []);
    const vendorRes = await sb.from('profiles').select('name,email,phone,address,ninea,rccm', `id=eq.${order.vendor_id}`).catch(() => []);
    const buyer  = buyerRes?.[0]  || {};
    const vendor = vendorRes?.[0] || {};

    const invoiceNum = `NXS-${ordId.slice(0, 8).toUpperCase()}`;
    const subtotal   = items.reduce((s, i) => s + ((i.unit_price || i.price || 0) * (i.quantity || 1)), 0);
    const total      = order.total || subtotal;

    const html = buildInvoiceHtml({ invoiceNum, order, buyer, vendor, items, subtotal, total });

    const url    = new URL(request.url);
    const format = url.searchParams.get('format'); // ?format=html (défaut) ou ?print=1

    // Si API PDF externe configurée
    if (env.PDF_API_URL && env.PDF_API_KEY) {
      try {
        const pdfRes = await fetch(env.PDF_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.PDF_API_KEY}` },
          body: JSON.stringify({ html, options: { format: 'A4', margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' } } }),
        });
        if (pdfRes.ok) {
          return new Response(await pdfRes.arrayBuffer(), {
            headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="facture-${invoiceNum}.pdf"` },
          });
        }
      } catch (e) { console.warn('[PDF] API externe échouée:', e.message); }
    }

    // Fallback HTML imprimable
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Invoice-Number': invoiceNum },
    });
  } catch (e) { return err(e.message, e.status || 500); }
}

function buildInvoiceHtml({ invoiceNum, order, buyer, vendor, items, subtotal, total }) {
  const fmt  = (n) => `${(n || 0).toLocaleString('fr-FR')} FCFA`;
  const date = new Date(order.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html><html lang="fr">
<head><meta charset="UTF-8"><title>Facture ${invoiceNum}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;background:white}
.page{max-width:800px;margin:0 auto;padding:40px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:20px;border-bottom:3px solid #00853E}
.logo{font-size:28px;font-weight:900;color:#00853E}.logo small{display:block;font-size:12px;font-weight:400;color:#666;margin-top:2px}
.inv-meta{text-align:right}.inv-meta h2{font-size:22px;color:#00853E;margin-bottom:4px}.inv-meta p{color:#666;font-size:12px}
.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:#d4edda;color:#155724}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:28px}
.party h3{font-size:11px;text-transform:uppercase;color:#00853E;letter-spacing:1px;margin-bottom:8px}
.party p{color:#444;line-height:1.6;font-size:12px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
thead{background:#00853E;color:white}
th{padding:10px 12px;text-align:left;font-size:12px}
td{padding:10px 12px;border-bottom:1px solid #eee;font-size:12px}
tr:last-child td{border-bottom:none}
.totals{margin-left:auto;width:280px}
.t-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee}
.t-total{font-size:16px;font-weight:700;color:#00853E;border-top:2px solid #00853E;border-bottom:none;padding-top:10px}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #eee;text-align:center;color:#999;font-size:11px}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">🛒 NEXUS<small>Market Sénégal</small></div>
    <div class="inv-meta">
      <h2>FACTURE</h2>
      <p><strong>${invoiceNum}</strong></p>
      <p>Date : ${date}</p>
      <p>Statut : <span class="badge">Payée</span></p>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <h3>Vendeur</h3>
      <p><strong>${vendor.name || 'N/A'}</strong><br>
      ${vendor.email || ''}<br>${vendor.phone || ''}<br>${vendor.address || ''}
      ${vendor.ninea ? `<br>NINEA: ${vendor.ninea}` : ''}
      ${vendor.rccm  ? `<br>RCCM: ${vendor.rccm}`   : ''}</p>
    </div>
    <div class="party">
      <h3>Acheteur</h3>
      <p><strong>${buyer.name || 'N/A'}</strong><br>
      ${buyer.email || ''}<br>${buyer.phone || ''}<br>
      ${order.delivery_address ? JSON.stringify(order.delivery_address) : (buyer.address || '')}</p>
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th style="text-align:center">Qté</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>
    ${items.map(i => `<tr>
      <td>${i.product_name || i.name || 'Article'}</td>
      <td style="text-align:center">${i.quantity || 1}</td>
      <td style="text-align:right">${fmt(i.unit_price || i.price)}</td>
      <td style="text-align:right"><strong>${fmt((i.unit_price || i.price || 0) * (i.quantity || 1))}</strong></td>
    </tr>`).join('')}
    </tbody>
  </table>
  <div class="totals">
    <div class="t-row"><span>Sous-total</span><span>${fmt(subtotal)}</span></div>
    ${order.shipping_fee > 0 ? `<div class="t-row"><span>Livraison</span><span>${fmt(order.shipping_fee)}</span></div>` : ''}
    <div class="t-row t-total"><span>TOTAL TTC</span><span>${fmt(total)}</span></div>
  </div>
  <div class="footer">
    <p>NEXUS Market Sénégal — nexus.sn — Merci pour votre confiance !</p>
    <p style="margin-top:4px">Document généré le ${new Date().toLocaleDateString('fr-FR')}</p>
  </div>
</div>
<script>if(location.search.includes('print=1'))window.print();</script>
</body></html>`;
}
