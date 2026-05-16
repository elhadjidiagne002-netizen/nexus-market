// functions/api/_lib/supabase.js
import { createClient } from "@supabase/supabase-js";

/** Client Supabase avec la service_role key (contourne RLS) */
export function createSupabaseClient(env) {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}

/** Alias pour compatibilité avec l'ancien code */
export function adminClient(env) {
  return createSupabaseClient(env);
}

/**
 * Vérifie que la requête contient un JWT Supabase valide.
 * Retourne null si OK, ou une Response 401 si non authentifié.
 */
export async function requireAuth(ctx) {
  const auth = ctx.request.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Non authentifié" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const sb = createSupabaseClient(ctx.env);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Token invalide ou expiré" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  ctx.user = user;
  ctx.supabase = sb;
  return null; // OK
}

/**
 * Vérifie que l'utilisateur est admin (role = 'admin' dans profiles).
 * Retourne null si OK, ou une Response 401/403 si non autorisé.
 */
export async function requireAdmin(ctx) {
  const authErr = await requireAuth(ctx);
  if (authErr) return authErr;

  const sb = ctx.supabase ?? createSupabaseClient(ctx.env);
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", ctx.user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return new Response(JSON.stringify({ error: "Accès refusé — admin requis" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  return null; // OK
}

/**
 * Vérifie que l'utilisateur a un rôle spécifique.
 */
export async function requireRole(ctx, role) {
  if (role === "admin") return requireAdmin(ctx);
  return requireAuth(ctx);
}
