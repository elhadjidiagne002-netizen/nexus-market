import { createSupabaseClient, requireAdmin } from "../../../_lib/supabase.js";
import { json, errorResponse } from "../../../_lib/response.js";

export async function onRequestPost(ctx) {
  try {
    const authErr = await requireAdmin(ctx);
    if (authErr) return authErr;

    const uid = ctx.params.uid;
    if (!uid) return errorResponse("uid manquant", 400);

    const sb = createSupabaseClient(ctx.env);
    const { error } = await sb
      .from("profiles")
      .update({ is_banned: true, banned_at: new Date().toISOString() })
      .eq("id", uid);

    if (error) return errorResponse(error.message, 500);

    return json({ ok: true, message: `Utilisateur ${uid} banni.` });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestDelete(ctx) {
  try {
    const authErr = await requireAdmin(ctx);
    if (authErr) return authErr;

    const uid = ctx.params.uid;
    if (!uid) return errorResponse("uid manquant", 400);

    const sb = createSupabaseClient(ctx.env);
    const { error } = await sb
      .from("profiles")
      .update({ is_banned: false, banned_at: null })
      .eq("id", uid);

    if (error) return errorResponse(error.message, 500);

    return json({ ok: true, message: `Utilisateur ${uid} débanni.` });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}
