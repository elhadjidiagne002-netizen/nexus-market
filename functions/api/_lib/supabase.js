// functions/api/_lib/supabase.js
import { createClient } from "@supabase/supabase-js";

export function adminClient(env) {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}
export const createSupabaseClient = adminClient;

export function extractToken(request) {
  return (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

async function verifySupabaseJWT(token, jwtSecret) {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sig = Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(`${h}.${p}`));
  if (!valid) return null;
  const payload = JSON.parse(atob(p.replace(/-/g,"+").replace(/_/g,"/")));
  if (payload.exp && payload.exp < Math.floor(Date.now()/1000)) return null;
  return payload;
}

export async function requireAuth(env, request) {
  const token = extractToken(request);
  if (!token) throw jsonResponse({ error: "Non authentifie" }, 401);
  const jwtSecret = env.SUPABASE_JWT_SECRET;
  let userId, userEmail, userRole;
  if (jwtSecret) {
    const payload = await verifySupabaseJWT(token, jwtSecret);
    if (!payload?.sub) throw jsonResponse({ error: "Token invalide ou expire" }, 401);
    userId = payload.sub; userEmail = payload.email; userRole = payload.role ?? null;
  } else {
    const sb = adminClient(env);
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) throw jsonResponse({ error: "Token invalide ou expire" }, 401);
    userId = user.id; userEmail = user.email;
  }
  const sb = adminClient(env);
  if (!userRole) {
    const { data: profile } = await sb.from("profiles").select("role,status").eq("id", userId).single();
    userRole = profile?.role ?? "buyer";
  }
  return { user: { id: userId, email: userEmail, role: userRole }, sb };
}

export async function requireAdmin(env, request) {
  const { user, sb } = await requireAuth(env, request);
  if (export async function requireRole(env, request, role) {
  if (role === "admin") return requireAdmin(env, request);
  return requireAuth(env, request);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
