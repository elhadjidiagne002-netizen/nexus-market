// ============================================================
// functions/api/products-feed.js — NEXUS Pro API
// Cloudflare Pages Function
//
// Sert le flux produits en XML (Google Shopping), JSON, ou CSV
// avec authentification par clé API.
//
// Variables Cloudflare Pages :
//   SUPABASE_URL          https://pqcqbstbdujzaclsiosv.supabase.co
//   SUPABASE_SERVICE_KEY  clé service_role
//
// Endpoints :
//   GET /api/products-feed?key=nxpro_xxx&format=xml     → RSS Google Shopping
//   GET /api/products-feed?key=nxpro_xxx&format=json    → JSON array
//   GET /api/products-feed?key=nxpro_xxx&format=csv     → CSV (plan Premium)
//   GET /api/products-feed?key=nxpro_xxx&cat=Mode       → filtrer par catégorie
//   GET /api/products-feed?key=nxpro_xxx&since=ISO      → modifiés depuis date
//   GET /api/products-feed?key=nxpro_xxx&limit=100&offset=200 → pagination
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

const BASE_URL = 'https://nexus.sn';
// [FIX PRIX] products.price est stocké en EUR (cf. frontend ×EUR_TO_FCFA).
// Le feed doit sortir des FCFA/XOF → conversion ici (entier, FCFA sans décimale).
const EUR_TO_FCFA = 655.957;
const priceXof = (p) => Math.round((parseFloat(p && p.price) || 0) * EUR_TO_FCFA);

// ── Supabase REST helper ─────────────────────────────────────
async function sb(env, path, method = 'GET', body = null) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey:        env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!r.ok) return null;
  return r.json();
}

// ── Valider la clé API via RPC Supabase ──────────────────────
async function validateKey(apiKey, env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/api_key_validate`, {
    method: 'POST',
    headers: {
      apikey:          env.SUPABASE_SERVICE_KEY,
      Authorization:   `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ p_key: apiKey }),
  });
  if (!r.ok) return { valid: false, error: 'Erreur serveur' };
  return r.json();
}

// ── Charger les produits ─────────────────────────────────────
async function loadProducts(env, { cat, since, limit, offset }) {
  let q = `products?select=id,name,description,price,category,stock,image_url,vendor_id,created_at,updated_at,active&active=eq.true&price=gt.0`;
  if (cat)   q += `&category=eq.${encodeURIComponent(cat)}`;
  if (since) q += `&updated_at=gte.${encodeURIComponent(since)}`;
  q += `&limit=${Math.min(limit, 1000)}&offset=${offset}`;
  q += `&order=created_at.desc`;

  const products = await sb(env, q);
  return products || [];
}

// ── Generateurs de formats ───────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toXML(products) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- NEXUS Pro API — flux Google Merchant — ${new Date().toISOString().slice(0,10)} — ${products.length} produits -->`,
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    '    <title>NEXUS Market Sénégal</title>',
    `    <link>${BASE_URL}</link>`,
    '    <description>Marketplace B2C/B2B — Sénégal &amp; Afrique de l\'Ouest</description>',
  ];

  const CAT_MAP = {
    'Électronique':  'Electronics',
    'Informatique':  'Electronics > Computers',
    'Téléphones':    'Electronics > Communications > Phones',
    'Mode':          'Apparel & Accessories',
    'Vêtements':     'Apparel & Accessories',
    'Alimentation':  'Food, Beverages & Tobacco',
    'Maison':        'Home & Garden',
    'Beauté':        'Health & Beauty',
    'Sport':         'Sporting Goods',
    'Auto':          'Vehicles & Parts',
    'Moto':          'Vehicles & Parts',
  };

  for (const p of products) {
    const url    = `${BASE_URL}/produit/${esc(p.id)}`;
    const img    = p.image_url || '';
    const gCat   = CAT_MAP[p.category] || 'Shopping';
    const avail  = (p.stock || 0) > 0 ? 'in stock' : 'out of stock';
    const price  = priceXof(p);

    lines.push('    <item>');
    lines.push(`      <g:id>${esc(p.id)}</g:id>`);
    lines.push(`      <g:title>${esc((p.name || '').slice(0, 150))}</g:title>`);
    lines.push(`      <g:description>${esc((p.description || p.name || '').slice(0, 5000))}</g:description>`);
    lines.push(`      <g:link>${url}</g:link>`);
    if (img.startsWith('http')) lines.push(`      <g:image_link>${esc(img)}</g:image_link>`);
    lines.push(`      <g:price>${price} XOF</g:price>`);
    lines.push(`      <g:availability>${avail}</g:availability>`);
    lines.push(`      <g:condition>new</g:condition>`);
    lines.push(`      <g:google_product_category>${esc(gCat)}</g:google_product_category>`);
    lines.push(`      <g:product_type>${esc(p.category || 'Autre')}</g:product_type>`);
    lines.push(`      <g:identifier_exists>no</g:identifier_exists>`);
    if (p.updated_at) lines.push(`      <g:custom_attribute name="updated_at">${p.updated_at}</g:custom_attribute>`);
    lines.push('    </item>');
  }

  lines.push('  </channel>', '</rss>');
  return lines.join('\n');
}

function toJSON(products) {
  return JSON.stringify({
    meta: {
      source:     'NEXUS Market Sénégal',
      url:        BASE_URL,
      generated:  new Date().toISOString(),
      count:      products.length,
    },
    products: products.map(p => ({
      id:           p.id,
      name:         p.name,
      description:  p.description || '',
      price_xof:    priceXof(p),
      category:     p.category || '',
      stock:        p.stock || 0,
      available:    (p.stock || 0) > 0,
      image_url:    p.image_url || '',
      product_url:  `${BASE_URL}/produit/${p.id}`,
      updated_at:   p.updated_at || p.created_at,
    })),
  }, null, 2);
}

function toCSV(products) {
  const header = 'id,name,description,price_xof,category,stock,available,image_url,product_url,updated_at';
  const rows = products.map(p => {
    const csvStr = (s) => '"' + String(s || '').replace(/"/g, '""') + '"';
    return [
      csvStr(p.id), csvStr(p.name), csvStr((p.description||'').slice(0,200)),
      priceXof(p), csvStr(p.category || ''), p.stock || 0,
      (p.stock || 0) > 0 ? 'true' : 'false',
      csvStr(p.image_url || ''), csvStr(`${BASE_URL}/produit/${p.id}`),
      csvStr(p.updated_at || p.created_at),
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

// ── Handler principal ────────────────────────────────────────
export async function onRequest({ request, env }) {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (method !== 'GET') return new Response('GET uniquement', { status: 405, headers: CORS });

  const url    = new URL(request.url);
  const apiKey = url.searchParams.get('key') || request.headers.get('X-API-Key');

  // ── Clé publique NEXUS (flux Google Shopping interne, sans auth) ──
  // Le flux public est en lecture seule, sans quota, pour Google Merchant Center uniquement
  const isPublicBot = request.headers.get('User-Agent')?.includes('Googlebot');

  if (!apiKey && !isPublicBot) {
    return new Response(JSON.stringify({
      error: 'Clé API requise',
      doc:   'Pour obtenir une clé API NEXUS Pro, visitez ' + BASE_URL + '/?api=subscribe',
      price: '15 000 FCFA/mois — 1 000 appels/jour — XML + JSON',
    }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Valider la clé
  let authInfo = { valid: true, allow_xml: true, allow_json: true, allow_csv: false };
  if (apiKey) {
    authInfo = await validateKey(apiKey, env);
    if (!authInfo.valid) {
      return new Response(JSON.stringify({ error: authInfo.error }), {
        status: 403,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }

  // Paramètres de filtrage
  const format = (url.searchParams.get('format') || 'xml').toLowerCase();
  const cat    = url.searchParams.get('cat') || '';
  const since  = url.searchParams.get('since') || '';
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '500'), 1000);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  // Vérifier les droits de format
  if (format === 'csv' && !authInfo.allow_csv) {
    return new Response(JSON.stringify({ error: 'Format CSV disponible avec le plan Premium uniquement' }), {
      status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Charger les produits
  const products = await loadProducts(env, { cat, since, limit, offset });

  // Générer la réponse
  const cacheControl = 'public, max-age=3600'; // Cache 1h CDN Cloudflare

  switch (format) {
    case 'json':
      return new Response(toJSON(products), {
        headers: {
          ...CORS,
          'Content-Type':  'application/json; charset=utf-8',
          'Cache-Control': cacheControl,
          'X-Total-Count': String(products.length),
        },
      });

    case 'csv':
      return new Response(toCSV(products), {
        headers: {
          ...CORS,
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="nexus-products.csv"',
          'Cache-Control':       cacheControl,
        },
      });

    default: // xml
      return new Response(toXML(products), {
        headers: {
          ...CORS,
          'Content-Type':  'application/rss+xml; charset=utf-8',
          'Cache-Control': cacheControl,
          'X-Total-Count': String(products.length),
        },
      });
  }
}
