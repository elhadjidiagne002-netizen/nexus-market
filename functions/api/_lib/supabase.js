// functions/api/_lib/supabase.js
import { createClient } from "@supabase/supabase-js";

// Client Supabase avec service_role key (contourne RLS)
export function adminClient(env) {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}

// Alias
export function createSupabaseClient(env) {
  return adminClient(env);
}

// Extrait le Bearer token depuis Authorization.
export function extractToken(request) {
  const auth = request.headers.get("Authorization") ?? "";
  return auth.replace(/^Bearer\s+/i, "").trim();
}

// requireAuth(env, request) — signature originale utilisee par les fonctions
// Retourne { user, sb } ou leve une Response 401
export async function requireAuth(env, request) {
  const token = extractToken(request);
  if (!token) {
    throw new Response(JSON.stringify({ error: "Non authentifie" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
  const sb = adminClient(env);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Token invalide ou expire" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
  return { user, sb };
}

// requireAdmin(env, request) — verifie role admin
export async function requireAdmin(env, request) {
  const { user, sb } = await requireAuth(env, request);
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    throw new Response(JSON.stringify({ error: "Acces refuse - admin requis" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
  return { user, sb };
}

// requireRole(env, request, role)
export async function requireRole(env, request, role) {
  if (role === "admin") return requireAdmin(env, request);
  return requireAuth(env, request);
}
