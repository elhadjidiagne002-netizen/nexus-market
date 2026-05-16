// functions/api/_lib/supabase.js
import { createClient } from "@supabase/supabase-js";

// Client admin (contourne RLS)
export function adminClient(env) {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}
export const createSupabaseClient = adminClient;

// Extraction du Bearer token
export function extractToken(request) {
  return (request.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

// requireAuth — HTTP direct (meme approche que utils.js, prouvee fonctionnelle)
export async function requireAuth(env, request) {
  const token = extractToken(request);
  if (!token) throw jsonResponse({ error: "Non authentifie" }, 401);

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;

  // 1. Valider le token via Supabase Auth
  const authRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (!authRes?.ok) throw jsonResponse({ error: "Token invalide ou expire" }, 401);
  const authUser = await authRes.json().catch(() => ({}));
  if (!authUser.id) throw jsonResponse({ error: "Token invalide ou expire" }, 401);

  // 2. Recuperer le role depuis profiles (source de verite)
  const profRes = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${authUser.id}&select=role,status,name`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  ).catch(() => null);

  const profiles = profRes?.ok ? await profRes.json().catch(() => []) : [];
  const profile  = profiles[0] || {};
  const role     = profile.role || "buyer";

  const sb = adminClient(env);
  return {
    user: { id: authUser.id, email: authUser.email, role, name: profile.name },
    sb,
  };
}

// requireAdmin
export async function requireAdmin(env, request) {
  const { user, sb } = await requireAuth(env, request);
  if (user.role !== "admin")
    throw jsonResponse({ error: "Acces refuse - admin requis" }, 403);
  return { user, sb };
}

// requireRole — accepte string OU tableau
export async function requireRole(env, request, role) {
  const { user, sb } = await requireAuth(env, request);
  const roles = Array.isArray(role) ? role : [role];
  if (roles.includes("admin") && user.role !== "admin")
    throw jsonResponse({ error: "Acces refuse - admin requis" }, 403);
  if (!roles.includes(user.role) && !roles.includes("admin"))
    throw jsonResponse({ error: "Acces refuse" }, 403);
  return { user, sb };
}

// handle — wrapper try/catch pour onRequest
export function handle(fn) {
  return async (ctx) => {
    try {
      if (ctx.request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
          },
        });
      }
      return await fn(ctx);
    } catch (e) {
      if (e instanceof Response) return e;
      return jsonResponse({ error: e.message || "Erreur interne" }, e.status || 500);
    }
  };
}

// ok / err helpers
export function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
export function err(msg, status = 400) {
  return jsonResponse({ error: msg }, status);
}

// Helper interne
function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
