/**
 * functions/api/auth/reset-password.js
 * POST /api/auth/reset-password
 *
 * Corps JSON :
 *   { action: "request", email: "...", name?: "..." }
 *   { action: "update",  password: "...", token: "..." }
 *
 * Variables Cloudflare Pages :
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
 *   RESEND_API_KEY, RESEND_FROM, SITE_URL
 */
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

function buildResetHtml({ name, resetUrl, siteUrl, expiresIn }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Réinitialisation mot de passe – NEXUS Market</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:560px">
        <tr><td style="background:#00853E;padding:28px 40px;text-align:center">
          <div style="color:#fff;font-size:24px;font-weight:700;letter-spacing:1px">🌿 NEXUS Market</div>
          <div style="color:#A7F3D0;margin:6px 0 0;font-size:13px">La marketplace du Sénégal</div>
        </td></tr>
        <tr><td style="padding:36px 40px 0;text-align:center">
          <div style="width:80px;height:80px;background:#FEF3C7;border-radius:50%;margin:0 auto;
                      display:inline-flex;align-items:center;justify-content:center;font-size:40px;line-height:1">🔑</div>
        </td></tr>
        <tr><td style="padding:24px 40px 32px">
          <h2 style="margin:0 0 16px;color:#111;font-size:20px;text-align:center;font-weight:700">
            Réinitialisation de votre mot de passe
          </h2>
          <p style="margin:0 0 8px;color:#374151;line-height:1.7">Bonjour <strong>${name}</strong>,</p>
          <p style="margin:0 0 28px;color:#374151;line-height:1.7">
            Vous avez demandé à réinitialiser votre mot de passe NEXUS Market.
            Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;width:100%">
            <tr><td align="center">
              <a href="${resetUrl}"
                 style="display:inline-block;background:#00853E;color:#fff;
                        padding:15px 44px;border-radius:8px;font-size:15px;
                        font-weight:700;text-decoration:none;letter-spacing:.3px">
                🔒 Réinitialiser mon mot de passe
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 4px;color:#6B7280;font-size:12px;line-height:1.6">
            Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
          </p>
          <p style="margin:0 0 20px;font-size:11px;line-height:1.5;word-break:break-all;color:#6B7280">
            <a href="${resetUrl}" style="color:#00853E">${resetUrl}</a>
          </p>
          <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;
                      padding:14px 18px;font-size:12px;color:#92400E;line-height:1.7">
            <strong>⚠️ Important :</strong><br>
            • Ce lien expire dans <strong>${expiresIn}</strong>.<br>
            • Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.<br>
            • Ne partagez jamais ce lien avec quiconque.
          </div>
        </td></tr>
        <tr><td style="background:#F9FAFB;padding:20px 40px;text-align:center;border-top:1px solid #E5E7EB">
          <p style="margin:0 0 4px;color:#9CA3AF;font-size:11px">
            © ${new Date().getFullYear()} NEXUS Market Sénégal
          </p>
          <p style="margin:0;color:#9CA3AF;font-size:11px">
            <a href="${siteUrl}" style="color:#00853E;text-decoration:none">nexus-market.sn</a>
            &nbsp;·&nbsp;
            <a href="mailto:sav@nexus.sn" style="color:#00853E;text-decoration:none">sav@nexus.sn</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendViaResend({ apiKey, from, to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Resend ${res.status}`);
  return data;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    SUPABASE_ANON_KEY = "",
    RESEND_API_KEY,
    RESEND_FROM  = "NEXUS Market <noreply@nexus-market.sn>",
    SITE_URL     = "https://nexus-market.pages.dev",
  } = env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return json(503, { error: "SUPABASE_URL ou SUPABASE_SERVICE_KEY manquante" });

  let body;
  try { body = await request.json(); }
  catch { return json(400, { error: "Corps JSON invalide" }); }

  const { action } = body;

  /* ─── action "request" ─────────────────────────────────────────────────── */
  if (action === "request") {
    const { email, name } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json(400, { error: "Email invalide" });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "recovery",
      email: email.trim().toLowerCase(),
      options: { redirectTo: SITE_URL },
    });

    if (linkErr) {
      console.error("[reset-password] generateLink:", linkErr.message);
      const notFound =
        linkErr.message.toLowerCase().includes("not found") ||
        linkErr.status === 404;

      if (notFound) return json(200, { ok: true, note: "email sent if account exists" });

      // Fallback : Supabase envoie lui-même l'email (sans branding)
      const { error: fbErr } = await sb.auth.resetPasswordForEmail(
        email.trim().toLowerCase(), { redirectTo: SITE_URL }
      );
      if (fbErr) return json(500, { error: "Erreur génération du lien. Réessayez." });
      return json(200, { ok: true, method: "supabase_fallback" });
    }

    const resetUrl = linkData?.properties?.action_link;
    if (!resetUrl) return json(500, { error: "Lien de reset non généré" });

    // Calcul expiration lisible
    const expiresAt = linkData?.properties?.email_otp_expires_at;
    let expiresIn = "1 heure";
    if (expiresAt) {
      const m = Math.round((new Date(expiresAt) - Date.now()) / 60000);
      expiresIn = m >= 60
        ? `${Math.round(m / 60)} heure${m >= 120 ? "s" : ""}`
        : `${m} minute${m > 1 ? "s" : ""}`;
    }

    if (!RESEND_API_KEY) {
      console.warn("[reset-password] RESEND_API_KEY manquante");
      return json(200, { ok: true, emailSent: false, note: "RESEND_API_KEY manquante" });
    }

    try {
      await sendViaResend({
        apiKey:  RESEND_API_KEY,
        from:    RESEND_FROM,
        to:      email,
        subject: "🔑 Réinitialisez votre mot de passe — NEXUS Market",
        html:    buildResetHtml({
          name:     name || email.split("@")[0],
          resetUrl,
          siteUrl:  SITE_URL,
          expiresIn,
        }),
      });
    } catch (e) {
      console.error("[reset-password] Resend:", e.message);
      return json(502, { error: "Email non envoyé. Vérifiez la configuration Resend." });
    }

    console.log(`[reset-password] email envoyé → ${email}`);
    return json(200, { ok: true, emailSent: true });
  }

  /* ─── action "update" ──────────────────────────────────────────────────── */
  if (action === "update") {
    const { password, token } = body;

    if (!password || password.length < 6)
      return json(400, { error: "Mot de passe trop court (minimum 6 caractères)" });
    if (!token)
      return json(401, { error: "Token de session requis" });

    const sbUser = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY || SUPABASE_SERVICE_KEY,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const { error: updateErr } = await sbUser.auth.updateUser({ password });
    if (updateErr) return json(400, { error: updateErr.message });

    console.log("[reset-password] mot de passe mis à jour");
    return json(200, { ok: true, message: "Mot de passe mis à jour avec succès" });
  }

  return json(400, { error: "action invalide — valeurs : request | update" });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
