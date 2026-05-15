// GET /api/email/logs?limit=100
import { requireRole, jsonOk, jsonErr, sbSelect } from "../../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const { user, error } = await requireRole(request, env, ["admin"]);
  if (error) return error;

  const url   = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const logs = await sbSelect(env, "email_logs",
    `order=created_at.desc&limit=${limit}`);

  return jsonOk(Array.isArray(logs) ? logs : []);
}
