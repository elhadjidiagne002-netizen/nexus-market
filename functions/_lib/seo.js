// functions/_lib/seo.js
// Génère une page d'atterrissage SEO (méta + Open Graph + JSON-LD Product)
// pour une fiche produit/annonce. Contenu visible côté serveur (indexable),
// avec un lien vers l'app interactive (pas de redirection auto → pas de cloaking).

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

/**
 * @param {object} o { origin, kind: 'produit'|'annonce', id, title, description,
 *                      image, priceFcfa, category, city }
 */
export function renderListingPage(o) {
  const kind = o.kind === 'annonce' ? 'annonce' : 'produit';
  const url = `${o.origin}/${kind}/${encodeURIComponent(o.id)}`;
  const appUrl = `${o.origin}/?product=${encodeURIComponent(o.id)}`;
  const title = o.title || 'Annonce NEXUS Market';
  const priceTxt = o.priceFcfa ? `${Number(o.priceFcfa).toLocaleString('fr-FR')} FCFA` : '';
  const desc = String(o.description || `${title} — ${o.category || ''} ${o.city || ''} sur NEXUS Market Sénégal.`)
    .replace(/\s+/g, ' ').trim().slice(0, 300);
  const img = o.image || `${o.origin}/og-image.png`;

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: title, image: [img], description: desc,
  };
  if (o.category) jsonld.category = o.category;
  if (o.priceFcfa) jsonld.offers = {
    '@type': 'Offer', price: Number(o.priceFcfa), priceCurrency: 'XOF',
    availability: 'https://schema.org/InStock', url,
    seller: { '@type': 'Organization', name: 'NEXUS Market Sénégal' },
  };

  return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}${priceTxt ? ' — ' + priceTxt : ''} · NEXUS Market Sénégal</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="NEXUS Market Sénégal">
${o.priceFcfa ? `<meta property="product:price:amount" content="${Number(o.priceFcfa)}"><meta property="product:price:currency" content="XOF">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:image" content="${esc(img)}">
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}</script>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#1F2937;line-height:1.6}img{max-width:100%;height:auto;border-radius:12px}h1{font-size:1.5rem;margin:.4rem 0}.price{color:#00853E;font-size:1.7rem;font-weight:800;margin:.6rem 0}.cat{color:#6B7280;font-size:.85rem;margin-bottom:.5rem}.cta{display:inline-block;background:#00853E;color:#fff;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:1.2rem}.top{color:#00853E;text-decoration:none;font-weight:700}.foot{color:#9CA3AF;font-size:.8rem;margin-top:2.2rem}</style>
</head><body>
<a class="top" href="${esc(o.origin)}/">← NEXUS Market</a>
<h1>${esc(title)}</h1>
${o.category ? `<div class="cat">${esc(o.category)}${o.city ? ' · ' + esc(o.city) : ''}</div>` : ''}
${o.image ? `<p><img src="${esc(img)}" alt="${esc(title)}" loading="lazy"></p>` : ''}
${priceTxt ? `<div class="price">${esc(priceTxt)}</div>` : ''}
<p>${esc(desc)}</p>
<a class="cta" href="${esc(appUrl)}">Voir ${kind === 'annonce' ? "l'annonce" : 'le produit'} sur NEXUS Market →</a>
<p class="foot">NEXUS Market — Marketplace sécurisée au Sénégal · Orange Money · Wave · Livraison partout.</p>
</body></html>`;
}

export async function sbGetOne(env, path) {
  try {
    const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch { return null; }
}
