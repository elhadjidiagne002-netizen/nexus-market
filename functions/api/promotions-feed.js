// functions/api/promotions-feed.js → /api/promotions-feed
// Flux promotions au format Google Merchant Promotions (XML), dérivé des coupons
// actifs. Affiche un badge « Promotion » sur les fiches Google Shopping.
// Schéma : https://support.google.com/merchants/answer/4588561
// Public en lecture seule, cache 1h.

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const EUR_TO_FCFA = 655.957;

async function sb(env, path) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY}` },
    });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

export async function onRequest({ request, env }) {
  const nowIso = new Date().toISOString();
  // Coupons actifs et non expirés (ou sans date d'expiration).
  const coupons = await sb(env, `coupons?select=code,discount_percent,type,description,min_order_amount,expires_at,active&active=eq.true&or=(expires_at.is.null,expires_at.gt.${nowIso})&limit=500`);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    '    <title>NEXUS Market Sénégal — Promotions</title>',
    `    <description>Codes promo et réductions en cours</description>`,
  ];

  const farFuture = '2030-12-31T23:59:00+0000';
  for (const c of (coupons || [])) {
    if (!c.code) continue;
    const isPercent = (c.type || 'percent') === 'percent';
    const start = nowIso.replace(/\.\d+Z$/, '+0000');
    const end = c.expires_at ? new Date(c.expires_at).toISOString().replace(/\.\d+Z$/, '+0000') : farFuture;

    lines.push('    <item>');
    lines.push(`      <g:promotion_id>${esc(c.code)}</g:promotion_id>`);
    lines.push('      <g:product_applicability>all_products</g:product_applicability>');
    lines.push('      <g:offer_type>generic_code</g:offer_type>');
    lines.push(`      <g:generic_redemption_code>${esc(c.code)}</g:generic_redemption_code>`);
    lines.push(`      <g:long_title>${esc(c.description || (isPercent ? `${Number(c.discount_percent)}% de réduction` : `Réduction ${esc(c.code)}`))}</g:long_title>`);
    if (isPercent) {
      lines.push(`      <g:percent_off>${Number(c.discount_percent)}</g:percent_off>`);
      lines.push('      <g:coupon_value_type>percent_off</g:coupon_value_type>');
    } else {
      // type 'fixed' : discount_percent porte alors un montant fixe (EUR) → conversion XOF.
      const xof = Math.round(Number(c.discount_percent) * EUR_TO_FCFA);
      lines.push(`      <g:money_off_amount>${xof} XOF</g:money_off_amount>`);
      lines.push('      <g:coupon_value_type>money_off</g:coupon_value_type>');
    }
    if (Number(c.min_order_amount) > 0) {
      const minXof = Math.round(Number(c.min_order_amount) * EUR_TO_FCFA);
      lines.push(`      <g:minimum_purchase_amount>${minXof} XOF</g:minimum_purchase_amount>`);
    }
    lines.push(`      <g:promotion_effective_dates>${start}/${end}</g:promotion_effective_dates>`);
    lines.push('      <g:redemption_channel>online</g:redemption_channel>');
    lines.push('    </item>');
  }

  lines.push('  </channel>', '</rss>');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
