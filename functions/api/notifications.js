// POST /api/notifications  { userId, type, title, message }
// Insert une notification pour n'importe quel utilisateur (service_role — contourne RLS).
// Appelé par le frontend quand l'insert Supabase direct échoue (RLS 403).
import { jsonOk, jsonErr, sbInsert } from "../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch { return jsonErr("JSON invalide", 400); }

  const { userId, type = "system", title, message } = body || {};
  if (!userId || !title) return jsonErr("userId et title requis", 400);

  // Valider que userId est un UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return jsonOk({ ok: true, skipped: true }); // non-UUID silencieusement ignoré
  }

  const res = await sbInsert(env, "notifications", {
    user_id:    userId,
    type,
    title,
    message:    message || null,
    read:       false,
    created_at: new Date().toISOString(),
  });

  if (!res?.ok) return jsonErr("Erreur Supabase", 502);
  const rows = await res.json().catch(() => []);
  return jsonOk({ ok: true, notification: rows[0] || null });
}
