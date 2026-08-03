// ============================================================
// functions/api/vendor/sales-export.js  →  GET /api/vendor/sales-export
// Export CSV des ventes du vendeur connecté (comptabilité) — #5 roadmap pro.
//
// Auth : JWT (le vendeur n'exporte QUE ses propres ventes — vendor_id = uid,
// filtré côté serveur avec la service key).
// Params optionnels : ?from=YYYY-MM-DD & to=YYYY-MM-DD & status=paid
//
// orders.total/subtotal sont en EUR (convention projet) → on ajoute une colonne
// FCFA (× 655.957) pour la lisibilité locale.
// ============================================================

import { requireAuth } from '../../_lib/utils.js';

const EUR_TO_FCFA = 655.957;

// Échappement CSV (RFC 4180) : guillemets doublés, champ quoté si , " ou saut de ligne.
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function sbGet(env, path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  return r.ok ? r.json() : [];
}

export async function onRequestGet({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)
    return new Response(JSON.stringify({ error: 'Backend non configuré' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

  const [user, authErr] = await requireAuth(request, env);
  if (authErr) return authErr;
  const uid = user.id;

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const status = url.searchParams.get('status'); // ex. 'paid' (payment_status)

  // Filtre serveur : UNIQUEMENT les commandes de ce vendeur.
  let q = `orders?select=id,created_at,status,payment_status,payment_method,total,subtotal,buyer_name`
    + `&vendor_id=eq.${encodeURIComponent(uid)}&order=created_at.desc&limit=5000`;
  if (from) q += `&created_at=gte.${encodeURIComponent(from)}`;
  if (to) q += `&created_at=lte.${encodeURIComponent(to)} 23:59:59`;
  if (status) q += `&payment_status=eq.${encodeURIComponent(status)}`;

  const rows = await sbGet(env, q);

  const header = ['Commande', 'Date', 'Statut', 'Paiement', 'Méthode', 'Total EUR', 'Total FCFA', 'Sous-total EUR', 'Client'];
  const lines = [header.map(csvCell).join(',')];
  for (const o of (rows || [])) {
    const totalEur = Number(o.total) || 0;
    lines.push([
      o.id,
      (o.created_at || '').slice(0, 10),
      o.status || '',
      o.payment_status || '',
      o.payment_method || '',
      totalEur.toFixed(2),
      Math.round(totalEur * EUR_TO_FCFA),
      (Number(o.subtotal) || 0).toFixed(2),
      o.buyer_name || '',
    ].map(csvCell).join(','));
  }
  // BOM UTF-8 → accents corrects à l'ouverture dans Excel.
  const csv = '﻿' + lines.join('\r\n');

  const fname = `nexus-ventes-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Cache-Control': 'no-store',
    },
  });
}
