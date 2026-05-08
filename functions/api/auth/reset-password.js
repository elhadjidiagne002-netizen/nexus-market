/**
 * functions/api/auth/reset-password.js
 * POST /api/auth/reset-password
 *
 * action "request" : génère un lien Supabase + envoie email branded via Resend
 * action "update"  : met à jour le mot de passe (session active requise)
 *
 * Variables d'environnement Cloudflare Pages :
 *   RESEND_API_KEY       — clé API Resend
 *   RESEND_FROM          — ex: "NEXUS Market <noreply@nexus-market.sn>"
 *   SUPABASE_URL         — URL Supabase
 *   SUPABASE_SERVICE_KEY — service_role key
 *   SITE_URL             — ex: https://nexus-market-asb.pages.dev
 */
import { createClient } from "@supabase/supabase-js";

// ── CORS ──────────────────────────────────────────────────────────────────────
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

// ── Template email reset ──────────────────────────────────────────────────────
function buildResetHtml({ name, resetUrl, siteUrl, expiresIn = "1 heure" }) {
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
             style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr><td style="background:#00853E;padding:28px 40px;text-align:center">
          <span style="color:#fff;font-size:24px;font-weight:700;letter-spacing:1px">🌿 NEXUS Market</span>
          <p style="color:#A7F3D0;margin:6px 0 0;font-size:13px">La marketplace du Sénégal</p>
        </td></tr>

        <!-- Icon -->
        <tr><td style="padding:36px 40px 0;text-align:center">
          <div style="width:72px;height:72px;background:#FEF3C7;border-radius:50%;margin:0 auto;
                      display:flex;align-items:center;justify-content:center;font-size:36px">
            🔑
          </div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:24px 40px 32px">
          <h2 style="margin:0 0 12px;color:#111;font-size:20px;text-align:center">
            Réinitialisation de votre mot de passe
          </h2>
          <p style="margin:0 0 8px;color:#555;line-height:1.7">
            Bonjour ${name ? `<strong>${name}</strong>` : "là"},
          </p>
          <p style="margin:0 0 24px;color:#555;line-height:1.7">
            Vous avez demandé à réinitialiser votre mot de passe NEXUS Market.
            Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
          </p>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px">
            <tr><td style="background:#00853E;border-radius:8px">
              <a href="${resetUrl}"
                 style="display:inline-block;padding:14px 40px;color:#fff;font-size:15px;
                        font-weight:600;text-decoration:none;letter-spacing:.3px">
                🔒 Réinitialiser mon mot de passe
              </a>
            </td></tr>
          </table>

          <!-- Lien texte -->
          <p style="margin:0 0 8px;color:#888;font-size:12px;line-height:1.6">
            Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
            <a href="${resetUrl}" style="color:#00853E;word-break:break-all">${resetUrl}</a>
          </p>

          <!-- Avertissements -->
          <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;
                      padding:12px 16px;margin-top:20px;font-size:12px;color:#92400E">
            <strong>⚠️ Important :</strong><br>
            • Ce lien expire dans <strong>${expiresIn}</strong><br>
            • Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.<br>
            • Votre mot de passe actuel ne sera <strong>pas</strong> modifié tant que vous
              n'aurez pas cliqué sur le lien.
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F9FAFB;padding:20px 40px;text-align:center;
                       border-top:1px solid #E5E7EB">
          <p style="margin:0 0 4px;color:#9CA3AF;font-size:11px">
            © ${new Date().getFullYear()} NEXUS Market Sénégal
          </p>
          <p style="margin:0;color:#9CA3AF;font-size:11px">
            <a href="${siteUrl}" style="color:#00853E">nexus-market.sn</a>
            &nbsp;·&nbsp;
            <a href="mailto:sav@nexus.sn" style="color:#00853E">sav@nexus.sn</a>
          </p>
        </td></tr>
      </table>

      <!-- Anti-spam mention -->
      <p style="margin:16px 0 0;color:#9CA3AF;font-size:11px;text-align:center">
        Vous recevez cet email car une demande de réinitialisation a été faite pour
        <a href="mailto:${resetUrl}" style="color:#6B7280">${resetUrl.split("email=")[1]?.split("&")[0] ?? "votre compte"}</a>.
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Envoi Resend ──────────────────────────────────────────────────────────────
async function sendViaResend({ apiKey, from, to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Resend ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ── Handler principal ─────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  const {
    RESEND_API_KEY,
    RESEND_FROM   = "NEXUS Market <noreply@nexus-market.sn>",
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    SITE_URL      = "https://nexus-market-asb.pages.dev",
  } = env;

  if (!RESEND_API_KEY)       return json(503, { error: "RESEND_API_KEY manquante" });
  if (!SUPABASE_SERVICE_KEY) return json(503, { error: "SUPABASE_SERVICE_KEY manquante" });

  let body;
  try { body = await request.json(); }
  catch { return json(400, { error: "JSON invalide" }); }

  const { action, email, name } = body;
  if (!action) return json(400, { error: "action requis (request|update)" });

  // ── action "request" : envoyer le lien de reset ────────────────────────────
  if (action === "request") {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: "email invalide" });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Générer le lien de reset via l'API Admin Supabase
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "recovery",
      email: email.trim().toLowerCase(),
      options: { redirectTo: SITE_URL },
    });

    if (linkErr) {
      console.error("[reset-password] generateLink error:", linkErr.message);

      // Fallback : utiliser resetPasswordForEmail si generateLink échoue
      // (ex: utilisateur inexistant — on répond toujours 200 pour éviter l'énumération)
      if (linkErr.message.toLowerCase().includes("not found") ||
          linkErr.message.toLowerCase().includes("user not found")) {
        console.log("[reset-password] user not found — silent 200 (anti-enumeration)");
        return json(200, { ok: true, note: "email sent if account exists" });
      }
      return json(500, { error: "Erreur génération du lien. Réessayez." });
    }

    const resetUrl  = linkData?.properties?.action_link;
    const expiresAt = linkData?.properties?.email_otp_expires_at;
    const displayName = name || email.split("@")[0];

    if (!resetUrl) {
      return json(500, { error: "Lien de reset non généré" });
    }

    // Calculer l'expiration humaine
    let expiresIn = "1 heure";
    if (expiresAt) {
      const diff = Math.round((new Date(expiresAt) - Date.now()) / 60000);
      expiresIn = diff >= 60 ? `${Math.round(diff / 60)} heure${diff >= 120 ? "s" : ""}` : `${diff} minutes`;
    }

    try {
      await sendViaResend({
        apiKey:  RESEND_API_KEY,
        from:    RESEND_FROM,
        to:      email,
        subject: "🔑 Réinitialisez votre mot de passe — NEXUS Market",
        html:    buildResetHtml({ name: displayName, resetUrl, siteUrl: SITE_URL, expiresIn }),
      });
    } catch (resendErr) {
      console.error("[reset-password] Resend error:", resendErr.message);
      return json(502, { error: "Email non envoyé. Vérifiez la configuration Resend." });
    }

    console.log(`[reset-password] reset email sent → ${email}`);
    return json(200, { ok: true });
  }

  // ── action "update" : mettre à jour le mot de passe ───────────────────────
  // Cette action est appelée côté client avec le JWT de la session recovery.
  // Le client Supabase gère directement updateUser() — ce endpoint sert de proxy
  // optionnel si on veut logger ou valider côté serveur.
  if (action === "update") {
    const { password, token } = body;
    if (!password || password.length < 6) {
      return json(400, { error: "Mot de passe trop court (min 6 caractères)" });
    }
    if (!token) {
      return json(401, { error: "Token de session requis" });
    }

    // Créer un client avec le token de l'utilisateur (pas la service key)
    const sbUser = createClient(SUPABASE_URL, env.SUPABASE_ANON_KEY || "", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { error: updateErr } = await sbUser.auth.updateUser({ password });
    if (updateErr) {
      return json(400, { error: updateErr.message });
    }

    console.log("[reset-password] password updated successfully");
    return json(200, { ok: true, message: "Mot de passe mis à jour avec succès" });
  }

  return json(400, { error: "action invalide (request|update)" });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}











