// GET /api/users/search?q=&limit=8
import { requireRole, jsonOk, jsonErr } from "../../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const { user, error } = await requireRole(request, env, ["admin"]);
  if (error) return error;

  const url   = new URL(request.url);
  const q     = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "8"), 50);

  if (!q || q.length < 2) return jsonOk([]);

  const { SUPABASE_URL: sbUrl, SUPABASE_SERVICE_KEY: key } = env;

  // Search by name OR email using ilike
  const query = `or=(name.ilike.*${encodeURIComponent(q)}*,email.ilike.*${encodeURIComponent(q)}*)` +
                `&select=id,name,email,role,status,avatar&limit=${limit}`;

  const res = await fetch(`${sbUrl}/rest/v1/profiles?${query}`, {
    headers: { "apikey": key, "Authorization": `Bearer ${key}` },
  }).catch(() => null);

  if (!res?.ok) return jsonOk([]);
  const results = await res.json().catch(() => []);
  return jsonOk(Array.isArray(results) ? results : []);
}
