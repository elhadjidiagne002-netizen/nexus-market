// PATCH /api/admin/vendors/:id/approve  { approved: bool }
import { requireRole, jsonOk, jsonErr, logAdminAction } from "../../../../_lib/auth.js";

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const { user, error } = await requireRole(request, env, ["admin"]);
  if (error) return error;

  const vendorId = params.id;
  if (!vendorId) return jsonErr("id requis", 400);

  let body;
  try { body = await request.json(); } catch { return jsonErr("JSON invalide", 400); }
  const approved = body?.approved !== false;

  const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } = env;

  // Call approve_vendor RPC (SECURITY DEFINER — contourne RLS)
  const rpcRes = await fetch(`${url}/rest/v1/rpc/approve_vendor`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "apikey": key, "Authorization": `Bearer ${key}` },
    body:    JSON.stringify({ vendor_id: vendorId, approved }),
  });

  if (!rpcRes.ok) {
    const err = await rpcRes.text().catch(() => "");
    // Fallback direct PATCH si la RPC n'existe pas encore
    if (err.includes("does not exist") || rpcRes.status === 404) {
      const fallback = await fetch(
        `${url}/rest/v1/profiles?id=eq.${vendorId}`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json", "apikey": key,
                     "Authorization": `Bearer ${key}`, "Prefer": "return=minimal" },
          body: JSON.stringify({
            status:     approved ? "approved" : "rejected",
            role:       approved ? "vendor"   : undefined,
            updated_at: new Date().toISOString(),
          }),
        }
      );
      if (!fallback.ok) return jsonErr("Approbation échouée", 502);
    } else {
      return jsonErr(`RPC error: ${err}`, 502);
    }
  }

  await logAdminAction(env, user.id, approved ? "approve_vendor" : "reject_vendor",
                       "vendor", vendorId, { approved });
  return jsonOk({ ok: true, vendorId, approved });
}
