// functions/api/reviews-feed.js → /api/reviews-feed
// Flux d'avis produits au format Google Product Reviews Feed (XML).
// Permet d'afficher les étoiles dans Google Shopping / fiches produit.
// Schéma : https://support.google.com/merchants/answer/7045996
// Public en lecture seule, cache 6h.

const BASE_URL = 'https://nexus-market-asb.pages.dev';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sb(env, path) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY}` },
    });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || BASE_URL;
  const limit = Math.min(parseInt(new URL(request.url).searchParams.get('limit') || '1000'), 5000);

  const reviews = await sb(env, `reviews?select=id,product_id,user_name,rating,comment,created_at&order=created_at.desc&limit=${limit}`);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns:vc="http://www.w3.org/2007/XMLSchema-versioning" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.google.com/shopping/reviews/schema/product/2.3/product_reviews.xsd">',
    `  <version>2.3</version>`,
    `  <publisher><name>NEXUS Market Sénégal</name></publisher>`,
    '  <reviews>',
  ];

  for (const r of (reviews || [])) {
    if (!r.product_id || !r.rating) continue;
    const url = `${origin}/produit/${esc(r.product_id)}`;
    lines.push('    <review>');
    lines.push(`      <review_id>${esc(r.id)}</review_id>`);
    lines.push(`      <reviewer><name>${esc(r.user_name || 'Client NEXUS')}</name></reviewer>`);
    if (r.created_at) lines.push(`      <review_timestamp>${esc(r.created_at)}</review_timestamp>`);
    if (r.comment) lines.push(`      <content>${esc(String(r.comment).slice(0, 4000))}</content>`);
    lines.push(`      <review_url type="singleton">${url}</review_url>`);
    lines.push(`      <ratings><overall min="1" max="5">${Number(r.rating)}</overall></ratings>`);
    lines.push('      <products><product>');
    lines.push(`        <product_ids><skus><sku>${esc(r.product_id)}</sku></skus></product_ids>`);
    lines.push(`        <product_url>${url}</product_url>`);
    lines.push('      </product></products>');
    lines.push('    </review>');
  }

  lines.push('  </reviews>', '</feed>');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=21600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
