// functions/api/admin/broadcast.js
// POST /api/admin/broadcast — envoi en masse d'un email à tous les inscrits.
//
// Réservé aux ADMINS (requireAdmin). Lit les emails depuis `profiles` (filtre par
// audience/rôle), puis envoie via l'API BATCH de Resend (100 emails / sous-requête
// → respecte les limites de sous-requêtes des Cloudflare Pages Functions). Repli
// per-email (sendEmail : Resend → Brevo) si la clé Resend est absente.
//
// Chaque destinataire reçoit un email individuel (jamais de CC/BCC → pas de fuite
// d'adresses). Pied de page de désinscription (RGPD). Mode `test` = envoi à l'admin.
import { options, json, err, requireAdmin, supabase, sendEmail, CORS } from '../_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from '../_lib/ratelimit.js';

const ROLES = ['buyer', 'buyer_pro', 'vendor', 'pro', 'breeder', 'courier'];

const escapeHtml = (s) => String(s || '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

function buildHtml({ title, message, link, linkLabel }) {
  const safeMsg = escapeHtml(message).replace(/\n/g, '<br>');
  const btn = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#00853E;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">${escapeHtml(linkLabel || 'Découvrir')}</a></p>`
    : '';
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#00853E,#064e2e);padding:20px 24px">
        <h1 style="color:#fff;margin:0;font-size:20px">NEXUS Market</h1>
      </div>
      <div style="padding:24px">
        <h2 style="color:#0f172a;font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h2>
        <div style="color:#374151;font-size:15px;line-height:1.7">${safeMsg}</div>
        ${btn}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;line-height:1.6">
        Vous recevez cet email en tant qu'inscrit sur NEXUS Market.<br>
        Pour gérer vos préférences ou vous désabonner, rendez-vous sur
        <a href="https://nexusmarket.sn" style="color:#00853E">nexusmarket.sn</a>.
      </div>
    </div></body></html>`;
}

// Envoi d'un lot (≤100) via l'API batch Resend. Chaque entrée = 1 email individuel.
async function sendBatchResend(env, from, items) {
  const r = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(items.map((it) => ({ from, to: it.to, subject: it.subject, html: it.html }))),
  });
  return r.ok;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  // ── Admin uniquement ──────────────────────────────────────────────────────
  const [admin, authErr] = await requireAdmin(request, env);
  if (authErr) return authErr;

  // ── Anti-abus : 5 envois / 10 min ─────────────────────────────────────────
  const rl = await rateLimit(env, `broadcast:${admin.id || clientIp(request)}`, 5, 600);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, CORS);

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const { subject, message, link, linkLabel, audience = 'all', test } = body || {};

  if (typeof subject !== 'string' || subject.trim().length < 2 || subject.length > 200)
    return err('Sujet invalide (2 à 200 caractères)', 400);
  if (typeof message !== 'string' || message.trim().length < 2 || message.length > 20000)
    return err('Message invalide (2 à 20000 caractères)', 400);
  if (link && !/^https?:\/\//.test(link)) return err('Lien invalide (doit commencer par http/https)', 400);
  if (audience !== 'all' && !ROLES.includes(audience)) return err('Audience invalide', 400);

  const html = buildHtml({ title: subject, message, link, linkLabel });
  const from = env.EMAIL_FROM || 'NEXUS Market <nx@nexusmarket.sn>';

  // ── Mode test : envoie uniquement à l'admin pour prévisualiser ────────────
  if (test) {
    const r = await sendEmail(env, { to: admin.email, subject: `[TEST] ${subject}`, html });
    return json({ ok: !!(r && r.ok), test: true, to: admin.email });
  }

  // ── Récupérer les destinataires depuis profiles ───────────────────────────
  const sb = supabase(env);
  const max = Math.max(1, Math.min(5000, parseInt(env.BROADCAST_MAX || '2000', 10)));
  let filter = 'email=not.is.null';
  if (audience !== 'all') filter += `&role=eq.${audience}`;
  let rows;
  try {
    rows = await sb.from('profiles').select('email', `${filter}&order=created_at.asc&limit=${max}`);
  } catch (e) {
    return err('Lecture des inscrits impossible : ' + e.message, 502);
  }

  // Dédoublonnage + validation
  const seen = new Set();
  const recipients = [];
  for (const r of (rows || [])) {
    const email = (r.email || '').trim().toLowerCase();
    if (!email || seen.has(email) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    seen.add(email);
    recipients.push(email);
  }
  if (!recipients.length) return json({ ok: true, total: 0, sent: 0, failed: 0, note: 'Aucun destinataire' });

  // ── Envoi ─────────────────────────────────────────────────────────────────
  let sent = 0, failed = 0;
  if (env.RESEND_API_KEY) {
    // Batch Resend : 100 emails / sous-requête.
    for (let i = 0; i < recipients.length; i += 100) {
      const chunk = recipients.slice(i, i + 100).map((to) => ({ to, subject, html }));
      const ok = await sendBatchResend(env, from, chunk).catch(() => false);
      if (ok) sent += chunk.length; else failed += chunk.length;
    }
  } else {
    // Repli sans Resend : per-email via Brevo, plafonné pour rester dans les
    // limites de sous-requêtes (sinon le batch Resend est requis pour le volume).
    for (const to of recipients.slice(0, 50)) {
      const r = await sendEmail(env, { to, subject, html }).catch(() => null);
      if (r && r.ok) sent++; else failed++;
    }
    if (recipients.length > 50) {
      return json({ ok: true, total: recipients.length, sent, failed, note: 'RESEND_API_KEY requise pour > 50 destinataires' });
    }
  }

  return json({ ok: true, total: recipients.length, sent, failed });
}
