import { createSupabaseClient, requireAdmin } from "../../_lib/supabase.js";
import { errorResponse } from "../../_lib/response.js";

export async function onRequestGet(ctx) {
  try {
    const authErr = await requireAdmin(ctx);
    if (authErr) return authErr;

    const sb = createSupabaseClient(ctx.env);
    const { data: vendors, error } = await sb
      .from("profiles")
      .select("id,email,full_name,shop_name,rating,created_at")
      .eq("role", "vendor")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) return errorResponse(error.message, 500);

    const headers = ["ID","Boutique","Email","Nom","Note","Date inscription"];
    const rows = (vendors || []).map(v => [
      v.id,
      `"${(v.shop_name || "").replace(/"/g, '""')}"`,
      v.email || "",
      `"${(v.full_name || "").replace(/"/g, '""')}"`,
      v.rating || 0,
      (v.created_at || "").slice(0, 10),
    ].join(","));

    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nexus_vendeurs_${new Date().toISOString().slice(0,10)}.csv"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}
