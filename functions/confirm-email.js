/**
 * functions/confirm-email.js
 * POST /confirm-email
 *
 * Deux usages :
 *  1. action="resend"  → renvoie l'email de confirmation Supabase via Resend
 *  2. action="welcome" → envoie un email de bienvenue branded après confirmation
 *
 * Variables d'environnement Cloudflare Pages requises :
 *   RESEND_API_KEY      — clé API Resend (re_xxxxxxxxx)
 *   RESEND_FROM         — expéditeur vérifié ex: "NEXUS Market <noreply@nexus-market.sn>"
 *   SUPABASE_URL        — URL Supabase
 *   SUPABASE_SERVICE_KEY — service_role key (pas la clé anon)
 *   SITE_URL            — ex: https://nexus-market-asb.pages.dev
 */
import { createClient } from "@supabase/supabase-js";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

// ── Template email de confirmation ──────────────────────────────────────────
function buildConfirmHtml({ name, confirmUrl, siteUrl }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr><td style="background:#00853E;padding:28px 40px;text-align:center">
          <span style="color:#fff;font-size:24px;font-weight:700;letter-spacing:1px">🌿 NEXUS Market</span>
          <p style="color:#A7F3D0;margin:6px 0 0;font-size:13px">La marketplace du Sénégal</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px 40px 24px">
          <h2 style="margin:0 0 16px;color:#111;font-size:20px">Confirmez votre adresse email</h2>
          <p style="margin:0 0 12px;color:#555;line-height:1.7">Bonjour <strong>${name || "là"}</strong>,</p>
          <p style="margin:0 0 24px;color:#555;line-height:1.7">
            Merci de vous être inscrit sur NEXUS Market. Cliquez sur le bouton ci-dessous pour activer votre compte.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px">
            <tr><td style="background:#00853E;border-radius:8px;text-align:center">
              <a href="${confirmUrl}"
                 style="display:inline-block;padding:14px 36px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:.3px">
                ✅ Confirmer mon email
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;color:#888;font-size:12px;line-height:1.6">
            Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
            <a href="${confirmUrl}" style="color:#00853E;word-break:break-all">${confirmUrl}</a>
          </p>
          <p style="margin:16px 0 0;color:#aaa;font-size:11px">
            Ce lien expire dans 24 heures. Si vous n'avez pas créé de compte, ignorez cet email.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F9FAFB;padding:20px 40px;text-align:center;border-top:1px solid #E5E7EB">
          <p style="margin:0;color:#9CA3AF;font-size:11px">
            © ${new Date().getFullYear()} NEXUS Market Sénégal — <a href="${siteUrl}" style="color:#00853E">nexus-market.sn</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Template email de bienvenue post-confirmation ──────────────────────────
function buildWelcomeHtml({ name, siteUrl }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <tr><td style="background:#00853E;padding:28px 40px;text-align:center">
          <span style="color:#fff;font-size:24px;font-weight:700">🌿 NEXUS Market</span>
          <p style="color:#A7F3D0;margin:6px 0 0;font-size:13px">La marketplace du Sénégal</p>
        </td></tr>
        <tr><td style="padding:40px 40px 24px">
          <div style="text-align:center;font-size:48px;margin-bottom:16px">🎉</div>
          <h2 style="margin:0 0 16px;color:#111;font-size:20px;text-align:center">
            Bienvenue sur NEXUS Market, ${name || "là"} !
          </h2>
          <p style="margin:0 0 24px;color:#555;line-height:1.7;text-align:center">
            Votre compte est activé. Vous pouvez maintenant acheter et vendre en toute confiance.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto">
            <tr><td style="background:#00853E;border-radius:8px;text-align:center">
              <a href="${siteUrl}"
                 style="display:inline-block;padding:14px 36px;color:#fff;font-size:15px;font-weight:600;text-decoration:none">
                🛒 Découvrir le marché
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#F9FAFB;padding:20px 40px;text-align:center;border-top:1px solid #E5E7EB">
          <p style="margin:0;color:#9CA3AF;font-size:11px">
            © ${new Date().getFullYear()} NEXUS Market Sénégal
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Envoi via Resend API ────────────────────────────────────────────────────
// Envoi avec REDONDANCE : Resend (primaire) -> Brevo (secours).
async function sendViaResend({ resendKey, brevoKey, from, to, subject, html }) {
  // 1) Resend
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html }),
      });
      if (res.ok) return await res.json().catch(() => ({}));
      console.warn("[confirm-email] Resend HTTP " + res.status + " -> bascule Brevo");
    } catch (e) { console.warn("[confirm-email] Resend KO:", e.message, "-> bascule Brevo"); }
  }
  // 2) Brevo (secours)
  if (brevoKey) {
    const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from || "");
    const sender = m ? { name: (m[1] || "NEXUS Market").trim(), email: m[2].trim() } : { name: "NEXUS Market", email: from };
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Brevo error ${res.status}`);
    return data;
  }
  throw new Error("Aucun fournisseur email (RESEND_API_KEY / BREVO_API_KEY)");
}

// ── Handler principal ───────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  const {
    RESEND_API_KEY,
    BREVO_API_KEY,
    RESEND_FROM = "NEXUS Market <nx@nexusmarket.sn>",
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    SITE_URL = "https://nexus-market-asb.pages.dev",
  } = env;

  if (!RESEND_API_KEY && !BREVO_API_KEY) return json(503, { error: "Aucun fournisseur email (RESEND_API_KEY / BREVO_API_KEY)" });
  if (!SUPABASE_SERVICE_KEY) return json(503, { error: "SUPABASE_SERVICE_KEY manquante" });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "JSON invalide" }); }

  const { action, email, name } = body;
  if (!email) return json(400, { error: "email requis" });
  if (!["resend", "welcome"].includes(action)) return json(400, { error: "action invalide (resend|welcome)" });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (action === "resend") {
      // Générer un nouveau lien de confirmation via l'API admin Supabase
      const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
        type: "signup",
        email,
        options: { redirectTo: SITE_URL },
      });

      if (linkErr) {
        console.error("[confirm-email] generateLink error:", linkErr.message);
        // Fallback: utiliser resend() du SDK Auth si generateLink échoue
        const { error: resendErr } = await sb.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: SITE_URL },
        });
        if (resendErr) return json(500, { error: resendErr.message });
        return json(200, { ok: true, method: "resend_fallback" });
      }

      const confirmUrl = linkData?.properties?.action_link || SITE_URL;
      const displayName = name || email.split("@")[0];

      await sendViaResend({
        resendKey: RESEND_API_KEY,
        brevoKey: BREVO_API_KEY,
        from: RESEND_FROM,
        to: email,
        subject: "✅ Confirmez votre inscription – NEXUS Market",
        html: buildConfirmHtml({ name: displayName, confirmUrl, siteUrl: SITE_URL }),
      });

      console.log(`[confirm-email] resend → ${email}`);
      return json(200, { ok: true });
    }

    if (action === "welcome") {
      const displayName = name || email.split("@")[0];
      await sendViaResend({
        resendKey: RESEND_API_KEY,
        brevoKey: BREVO_API_KEY,
        from: RESEND_FROM,
        to: email,
        subject: "🎉 Bienvenue sur NEXUS Market !",
        html: buildWelcomeHtml({ name: displayName, siteUrl: SITE_URL }),
      });

      console.log(`[confirm-email] welcome → ${email}`);
      return json(200, { ok: true });
    }
  } catch (e) {
    console.error("[confirm-email] error:", e.message);
    return json(500, { error: e.message });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}
