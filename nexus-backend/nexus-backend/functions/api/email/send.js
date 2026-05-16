import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireAuth(env, request);
  const { to, subject, html, template, variables } = await request.json();
  if (!to || (!html && !template)) return err("to et (html ou template) requis");

  // Use Resend (recommended) or fallback to EmailJS REST
  const RESEND_KEY = env.RESEND_API_KEY;
  if (RESEND_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + RESEND_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM || "NEXUS Market <noreply@nexus.sn>", to, subject, html: html || "" })
    });
    const data = await res.json();
    if (!res.ok) return err(data.message || "Erreur Resend", 502);
    await logEmail(env, { to, subject, provider: "resend", status: "sent", sent_by: user.id });
    return ok({ sent: true, id: data.id });
  }

  // Simulation fallback
  await logEmail(env, { to, subject, provider: "simulation", status: "simulated", sent_by: user.id });
  console.log("[Email simulation] To:", to, "Subject:", subject);
  return ok({ sent: true, simulated: true });
});

async function logEmail(env, record) {
  const sb = (await import("../_lib/supabase.js")).adminClient(env);
  await sb.from("email_logs").insert(record).catch(() => {});
}
