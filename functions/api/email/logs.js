import { requireRole } from "../../api/_lib/supabase.js";
import { ok, err } from "../../api/_lib/response.js";

export async function onRequestGet({ request, env }) {
  await requireRole(env, request, ["admin"]);
  const url   = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  const res = await fetch(
    `${SB_URL}/rest/v1/email_logs?order=created_at.desc&limit=${limit}`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  const logs = res.ok ? await res.json() : [];
  return ok(Array.isArray(logs) ? logs : []);
}