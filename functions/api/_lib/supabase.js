// functions/api/_lib/supabase.js
import { createClient } from "@supabase/supabase-js";

// Client Supabase avec la service_role key (contourne RLS)
export function createSupabaseClient(env) {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}

// Alias pour compatibilite avec l'ancien code
export function adminClient(env) {
  return createSupabaseClient(env);
}

// Extrait le Bearer token depuis Authorization. Retourne "" si absent.
export function extractToken(request) {
  const auth = request.headers.get("Authorization") ?? "";
  return auth.replace(/^Bearer\s+/i, "").trim();
}

// Verifie JWT Supabase. Retourne null si OK, Response 401 sinon.
export async function requireAuth(ctx) {
  const token = extractToken(ctx.request);
  if (!token) {
    return new Response(JSON.stringify({ error: "Non authentifie" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
  const sb = createSupabaseClient(ctx.env);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Token invalide ou expire" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
  ctx.user = user;
  ctx.supabase = sb;
  return null;
}

// Verifie role admin. Retourne null si OK, Response 403 sinon.
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
    return new Response(JSON.stringify({ error: "Acces refuse - admin requis" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
  return null;
}

// Verifie un role specifique.
export async function requireRole(ctx, role) {
  if (role === "admin") return requireAdmin(ctx);
  return requireAuth(ctx);
}
