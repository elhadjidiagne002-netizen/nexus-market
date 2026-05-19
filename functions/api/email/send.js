/**
 * POST /api/email/send
 * Proxy d'envoi d'emails côté serveur pour ne plus exposer la clé EmailJS publique.
 *
 * Body (JSON) :
 *   { to: "destinataire@email.com", subject: "...", html: "<p>...</p>", from? }
 *
 * Providers supportés (via EMAIL_PROVIDER) :
 *   - "resend"   → Resend.com (recommandé, 100 emails/jour gratuit)
 *   - "emailjs"  → EmailJS via leur API REST (utilise tes templates existants)
 *   - "simulate" → log seulement (dev / preview)
 *
 * Variables d'env :
 *   EMAIL_PROVIDER          = "resend" | "emailjs" | "simulate"
 *   EMAIL_FROM              = "NEXUS Market <no-reply@nexus.sn>"  (Resend)
 *   RESEND_API_KEY          = re_...                              (Resend)
 *   EMAILJS_PRIVATE_KEY     = ...                                 (EmailJS)
 *   EMAILJS_SERVICE_ID      = service_84yfkgf                     (EmailJS)
 *   EMAILJS_TEMPLATE_ID     = template_t075pts                    (EmailJS)
 *   EMAILJS_PUBLIC_KEY      = WSBntSTWdh5d9usZC                   (EmailJS, déjà connue côté frontend)
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Auth obligatoire pour éviter le spam ─────────────────────────────────
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié' }, 401);
  }

  // ── Parsing body ─────────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON invalide' }, 400);
  }

  const { to, subject, html, from } = body;
  if (!to || !subject || !html) {
    return json({ error: 'Champs requis : to, subject, html' }, 400);
  }

  // Validation basique de l'email destinataire
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json({ error: 'Email destinataire invalide' }, 400);
  }

  // ── Rate limiting côté serveur (mémoire locale par worker, best-effort) ──
  // Note : Cloudflare Workers ont une mémoire éphémère, donc ce rate limit
  // ne couvre qu'une seule instance. Pour un vrai rate limit, il faudrait
  // Cloudflare KV ou Durable Objects.
  if (!globalThis.__nexusEmailRateLimit) globalThis.__nexusEmailRateLimit = new Map();
  const rl = globalThis.__nexusEmailRateLimit;
  const now = Date.now();
  const lastSent = rl.get(to) || 0;
  if (now - lastSent < 30000) {
    return json({ error: 'Rate limit : 1 email / 30s par destinataire' }, 429);
  }
  rl.set(to, now);
  // Cleanup (max 200 entrées en mémoire)
  if (rl.size > 200) {
    for (const [k, v] of rl) if (now - v > 3600000) rl.delete(k);
  }

  const provider = (env.EMAIL_PROVIDER || 'simulate').toLowerCase();

  // ── Mode simulation ──────────────────────────────────────────────────────
  if (provider === 'simulate') {
    console.log(`[EMAIL SIM] → ${to} | ${subject}`);
    return json({ ok: true, simulated: true, provider: 'simulate' });
  }

  // ── Resend.com (recommandé) ──────────────────────────────────────────────
  if (provider === 'resend') {
    if (!env.RESEND_API_KEY) {
      return json({ error: 'Resend non configuré (RESEND_API_KEY manquante)' }, 503);
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: from || env.EMAIL_FROM || 'NEXUS Market <no-reply@nexus.sn>',
          to: [to],
          subject,
          html
        })
      });
      const data = await res.json();
      if (!res.ok) {
        return json({ error: data.message || 'Échec Resend', detail: data }, 502);
      }
      return json({ ok: true, provider: 'resend', id: data.id });
    } catch (e) {
      return json({ error: 'Resend injoignable', detail: e.message }, 502);
    }
  }

  // ── EmailJS (via REST API serveur, n'expose pas la clé) ──────────────────
  if (provider === 'emailjs') {
    if (!env.EMAILJS_SERVICE_ID || !env.EMAILJS_TEMPLATE_ID || !env.EMAILJS_PUBLIC_KEY) {
      return json({ error: 'EmailJS non configuré' }, 503);
    }
    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // EmailJS accepte une clé privée optionnelle pour les requêtes serveur
          ...(env.EMAILJS_PRIVATE_KEY ? { 'X-EJS-Private-Key': env.EMAILJS_PRIVATE_KEY } : {})
        },
        body: JSON.stringify({
          service_id: env.EMAILJS_SERVICE_ID,
          template_id: env.EMAILJS_TEMPLATE_ID,
          user_id: env.EMAILJS_PUBLIC_KEY,
          accessToken: env.EMAILJS_PRIVATE_KEY,
          template_params: {
            to_email: to,
            reply_to: to,
            subject,
            html_body: html
          }
        })
      });
      const text = await res.text();
      if (!res.ok) {
        return json({ error: 'Échec EmailJS', detail: text }, 502);
      }
      return json({ ok: true, provider: 'emailjs' });
    } catch (e) {
      return json({ error: 'EmailJS injoignable', detail: e.message }, 502);
    }
  }

  return json({ error: `Provider EMAIL_PROVIDER inconnu : ${provider}` }, 503);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
