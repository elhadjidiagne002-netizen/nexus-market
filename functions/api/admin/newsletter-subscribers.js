// functions/api/admin/newsletter-subscribers.js — GET /api/admin/newsletter-subscribers
// Liste des inscrits à la newsletter (table newsletter_subscribers, remplie par
// le formulaire "S'abonner" du footer public) — pour campagnes email/WhatsApp
// depuis le tableau de bord admin.
//
// Réservé aux ADMINS (requireAdmin). ?format=csv => export CSV (BOM UTF-8 Excel).
import { options, err, requireAdmin, supabase } from '../_lib/utils.js';

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function onRequestOptions() { return options(); }

export async function onRequestGet({ request, env }) {
  const [, authErr] = await requireAdmin(request, env);
  if (authErr) return authErr;

  const sb = supabase(env);
  let rows;
  try {
    rows = await sb.from('newsletter_subscribers')
      .select('email,source,created_at', 'order=created_at.desc&limit=10000');
  } catch (e) {
    return err('Lecture des inscrits impossible : ' + e.message, 502);
  }
  rows = rows || [];

  const url = new URL(request.url);
  if (url.searchParams.get('format') === 'csv') {
    const header = ['Email', 'Source', 'Date d\'inscription'];
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push([r.email || '', r.source || '', (r.created_at || '').slice(0, 10)].map(csvCell).join(','));
    }
    const csv = '﻿' + lines.join('\r\n'); // BOM UTF-8 (Excel)
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="newsletter-inscrits-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  return new Response(JSON.stringify({ ok: true, total: rows.length, rows }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
