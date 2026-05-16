import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Admin client (service_role) — server-side only, never expose to browser */
export function adminClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/** User client authenticated from the bearer token in the request */
export function userClient(env, token) {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  if (token) sb.auth.setSession({ access_token: token, refresh_token: "" }).catch(() => {});
  return sb;
}

/** Extract bearer token from Authorization header */
export function extractToken(request) {
  const h = request.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

/** Verify token and return { user } or throw */
export async function requireAuth(env, request) {
  const token = extractToken(request);
  if (!token) throw { status: 401, message: "Non authentifié" };
  const sb = adminClient(env);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) throw { status: 401, message: "Token invalide ou expiré" };
  return { user, token };
}

/** Verify token + require role(s) */
export async function requireRole(env, request, roles) {
  const { user, token } = await requireAuth(env, request);
  const sb = adminClient(env);
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role || "buyer";
  if (!roles.includes(role)) throw { status: 403, message: "Accès interdit" };
  return { user, role, token };
}
