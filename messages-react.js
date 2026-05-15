// PATCH /api/messages/:msgId/react  { emoji }
// Toggle emoji reaction sur un message. Stocké dans messages.reactions (JSONB).
import { requireRole, jsonOk, jsonErr } from "../../../../_lib/auth.js";

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const { user, error } = await requireRole(request, env, null);
  if (error) return error;

  const msgId = params.msgId;
  if (!msgId) return jsonErr("msgId requis", 400);

  let body;
  try { body = await request.json(); } catch { return jsonErr("JSON invalide", 400); }
  const { emoji } = body || {};
  if (!emoji) return jsonErr("emoji requis", 400);

  const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } = env;

  // Lire le message pour obtenir les réactions actuelles
  const getRes = await fetch(
    `${url}/rest/v1/messages?id=eq.${encodeURIComponent(msgId)}&select=reactions`,
    { headers: { "apikey": key, "Authorization": `Bearer ${key}` } }
  ).catch(() => null);

  const rows = getRes?.ok ? await getRes.json().catch(() => []) : [];
  const msg  = rows[0];
  if (!msg) return jsonErr("Message introuvable", 404);

  // Toggle : ajouter ou retirer l'userId de l'emoji
  const reactions = { ...(msg.reactions || {}) };
  if (!reactions[emoji]) reactions[emoji] = [];
  const idx = reactions[emoji].indexOf(user.id);
  if (idx >= 0) {
    reactions[emoji].splice(idx, 1);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  } else {
    reactions[emoji].push(user.id);
  }

  // Mettre à jour
  const patchRes = await fetch(
    `${url}/rest/v1/messages?id=eq.${encodeURIComponent(msgId)}`,
    {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", "apikey": key,
                 "Authorization": `Bearer ${key}`, "Prefer": "return=minimal" },
      body: JSON.stringify({ reactions }),
    }
  ).catch(() => null);

  if (!patchRes?.ok) return jsonErr("Erreur Supabase", 502);
  return jsonOk({ ok: true, msgId, reactions });
}
