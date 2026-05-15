// GET /api/admin/logs?limit=100&action=&page=1
import { requireRole, jsonOk, jsonErr, sbSelect } from "../../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const { user, error } = await requireRole(request, env, ["admin"]);
  if (error) return error;

  const url    = new URL(request.url);
  const limit  = Math.min(parseInt(url.searchParams.get("limit")  || "100"), 500);
  const page   = Math.max(parseInt(url.searchParams.get("page")   || "1"), 1);
  const action = url.searchParams.get("action") || "";
  const offset = (page - 1) * limit;

  let query = `order=created_at.desc&limit=${limit}&offset=${offset}`;
  if (action) query += `&action=eq.${encodeURIComponent(action)}`;

  const logs = await sbSelect(env, "admin_logs", query);
  return jsonOk({ logs: Array.isArray(logs) ? logs : [], page, limit });
}
