import { createSupabaseClient, requireAdmin } from "../../../_lib/supabase.js";
import { json, errorResponse } from "../../../_lib/response.js";

export async function onRequestPost(ctx) {
  try {
    const authErr = await requireAdmin(ctx);
    if (authErr) return authErr;

    const vendorId = ctx.params.vendorId;
    if (!vendorId) return errorResponse("vendorId manquant", 400);

    const sb = createSupabaseClient(ctx.env);

    // Approuver dans profiles
    const { error: profErr } = await sb
      .from("profiles")
      .update({ role: "vendor", vendor_approved: true, approved_at: new Date().toISOString() })
      .eq("id", vendorId);

    if (profErr) return errorResponse(profErr.message, 500);

    // Mettre à jour le statut dans pending_vendors
    await sb
      .from("pending_vendors")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", vendorId);

    return json({ ok: true, message: `Vendeur ${vendorId} approuvé.` });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function onRequestDelete(ctx) {
  try {
    const authErr = await requireAdmin(ctx);
    if (authErr) return authErr;

    const vendorId = ctx.params.vendorId;
    if (!vendorId) return errorResponse("vendorId manquant", 400);

    const sb = createSupabaseClient(ctx.env);

    await sb
      .from("pending_vendors")
      .update({ status: "rejected", rejected_at: new Date().toISOString() })
      .eq("id", vendorId);

    return json({ ok: true, message: `Vendeur ${vendorId} refusé.` });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}
