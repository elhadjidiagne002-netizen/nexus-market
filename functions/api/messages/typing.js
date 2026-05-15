// POST /api/messages/typing  { convId }
// Enregistre un indicateur "en train de taper" (TTL 5 s via expires_at).
// GET  /api/messages/typing/:convId  → renvoie qui est en train de taper.
import { requireRole, jsonOk, jsonErr, sbInsert } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { user, error } = await requireRole(request, env, null);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonErr("JSON invalide", 400); }
  const { convId } = body || {};
  if (!convId) return jsonErr("convId requis", 400);

  const expiresAt = new Date(Date.now() + 5000).toISOString(); // TTL 5s

  const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } = env;

  // Upsert typing indicator
  await fetch(`${url}/rest/v1/typing_indicators`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key, "Authorization": `Bearer ${key}`,
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      conv_id:    convId,
      user_id:    user.id,
      user_name:  user.name || user.email || "…",
      expires_at: expiresAt,
    }),
  }).catch(() => {});

  return jsonOk({ ok: true });
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const { user, error } = await requireRole(request, env, null);
  if (error) return error;

  const url    = new URL(request.url);
  const convId = params?.convId || url.searchParams.get("convId");
  if (!convId) return jsonOk([]);

  const { SUPABASE_URL: sbUrl, SUPABASE_SERVICE_KEY: key } = env;

  // Fetch non-expired indicators for this conversation (excluding self)
  const res = await fetch(
    `${sbUrl}/rest/v1/typing_indicators?conv_id=eq.${encodeURIComponent(convId)}` +
    `&user_id=neq.${user.id}&expires_at=gte.${new Date().toISOString()}` +
    `&select=user_id,user_name`,
    { headers: { "apikey": key, "Authorization": `Bearer ${key}` } }
  ).catch(() => null);

  const rows = res?.ok ? await res.json().catch(() => []) : [];
  return jsonOk(Array.isArray(rows) ? rows : []);
}
