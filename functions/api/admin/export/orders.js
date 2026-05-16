import { createSupabaseClient, requireAdmin } from "../../_lib/supabase.js";
import { json, csvResponse, errorResponse } from "../../_lib/response.js";

export async function onRequestGet(ctx) {
  try {
    const authErr = await requireAdmin(ctx);
    if (authErr) return authErr;

    const sb = createSupabaseClient(ctx.env);
    const { data: orders, error } = await sb
      .from("orders")
      .select("id,created_at,status,amount_fcfa,payment_method,buyer_name,buyer_email,vendor_id,tracking_number")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) return errorResponse(error.message, 500);

    const headers = ["ID","Date","Statut","Montant FCFA","Paiement","Acheteur","Email","Vendeur ID","Tracking"];
    const rows = (orders || []).map(o => [
      o.id,
      (o.created_at || "").slice(0, 10),
      o.status || "",
      o.amount_fcfa || 0,
      o.payment_method || "",
      `"${(o.buyer_name || "").replace(/"/g, '""')}"`,
      o.buyer_email || "",
      o.vendor_id || "",
      o.tracking_number || "",
    ].join(","));

    // [FIX] Utiliser \n (échappé) et non un saut de ligne littéral dans la string
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nexus_commandes_${new Date().toISOString().slice(0,10)}.csv"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}
