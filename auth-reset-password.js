// ── POST /api/auth/reset-password  { email } ──────────────────────────────
// Envoie un email de réinitialisation via Supabase Auth (built-in flow).
import { jsonOk, jsonErr } from "../../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch { return jsonErr("JSON invalide", 400); }
  const { email } = body || {};
  if (!email) return jsonErr("email requis", 400);

  const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } = env;
  const origin = new URL(request.url).origin;

  const res = await fetch(`${url}/auth/v1/recover`, {
    method:  "POST",
    headers: { "apikey": key, "Content-Type": "application/json" },
    body:    JSON.stringify({
      email:       email.trim().toLowerCase(),
      redirect_to: `${origin}/?reset_password=1`,
    }),
  }).catch(() => null);

  // Toujours retourner 200 (ne pas révéler si l'email existe)
  return jsonOk({ ok: true, message: "Si cet email est enregistré, un lien de réinitialisation a été envoyé." });
}
