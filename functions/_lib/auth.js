// functions/_lib/auth.js
// ── Shared auth helper — resolves JWT → { id, role, email } ──────────────────
// Usage : import { resolveUser, requireRole } from "auth.js";

export async function resolveUser(request, env) {
  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return null;

  const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;

  // Get auth.uid from Supabase
  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { "apikey": SB_KEY, "Authorization": `Bearer ${jwt}` },
  }).catch(() => null);
  if (!userRes?.ok) return null;

  const { id, email } = await userRes.json().catch(() => ({}));
  if (!id) return null;

  // Get role from profiles
  const profRes = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${id}&select=role,status`,
    { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` } }
  ).catch(() => null);
  const profiles = profRes?.ok ? await profRes.json().catch(() => []) : [];
  const profile  = profiles[0] || {};

  return { id, email, role: profile.role || "buyer", status: profile.status || "active" };
}

export async function requireRole(request, env, allowedRoles) {
  const user = await resolveUser(request, env);
  if (!user) return { user: null, error: jsonErr("Non authentifié", 401) };
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return { user: null, error: jsonErr("Accès refusé", 403) };
  }
  return { user, error: null };
}

export function jsonErr(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonOk(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function sbPatch(env, table, filter, updates) {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } = env;
  return fetch(`${url}/rest/v1/${table}?${filter}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json", "apikey": key,
               "Authorization": `Bearer ${key}`, "Prefer": "return=representation" },
    body: JSON.stringify(updates),
  });
}

export async function sbInsert(env, table, row) {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } = env;
  return fetch(`${url}/rest/v1/${table}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "apikey": key,
               "Authorization": `Bearer ${key}`, "Prefer": "return=representation" },
    body: JSON.stringify(row),
  });
}

export async function sbSelect(env, table, query = "") {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } = env;
  const res = await fetch(`${url}/rest/v1/${table}${query ? "?" + query : ""}`, {
    headers: { "apikey": key, "Authorization": `Bearer ${key}` },
  });
  return res.ok ? res.json() : [];
}

export async function logAdminAction(env, adminId, action, targetType, targetId, details = {}) {
  await sbInsert(env, "admin_logs", {
    admin_id:    adminId,
    action,
    target_type: targetType,
    target_id:   targetId,
    details,
    created_at:  new Date().toISOString(),
  }).catch(() => {});
}
