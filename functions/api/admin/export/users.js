import { createSupabaseClient, requireAdmin } from "../../_lib/supabase.js";
import { errorResponse } from "../../_lib/response.js";

export async function onRequestGet(ctx) {
  try {
    const authErr = await requireAdmin(ctx);
    if (authErr) return authErr;

    const sb = createSupabaseClient(ctx.env);
    const { data: users, error } = await sb
      .from("profiles")
      .select("id,email,full_name,role,created_at,is_banned")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) return errorResponse(error.message, 500);

    const headers = ["ID","Email","Nom","Rôle","Date inscription","Banni"];
    const rows = (users || []).map(u => [
      u.id,
      u.email || "",
      `"${(u.full_name || "").replace(/"/g, '""')}"`,
      u.role || "buyer",
      (u.created_at || "").slice(0, 10),
      u.is_banned ? "oui" : "non",
    ].join(","));

    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nexus_utilisateurs_${new Date().toISOString().slice(0,10)}.csv"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}
