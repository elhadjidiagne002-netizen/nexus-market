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

// Verification JWT locale — decode le secret base64 avant usage HMAC
async function verifySupabaseJWT(token, jwtSecret) {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  try {
    // Decode base64 secret → bytes (Supabase stocke le secret en base64)
    const secretBytes = Uint8Array.from(
      atob(jwtSecret),
      c => c.charCodeAt(0)
    );
    const key = await crypto.subtle.importKey(
      "raw", secretBytes,
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sig = Uint8Array.from(
      atob(s.replace(/-/g, "+").replace(/_/g, "/")),
      c => c.charCodeAt(0)
    );
    const enc = new TextEncoder();
    const valid = await crypto.subtle.verify(
      "HMAC", key, sig, enc.encode(`${h}.${p}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// requireAuth — verifie le JWT, retourne { user, sb }
export async function requireAuth(env, request) {
  const token = extractToken(request);
  if (!token) throw jsonResponse({ error: "Non authentifie" }, 401);

  const jwtSecret = env.SUPABASE_JWT_SECRET;
  let userId, userEmail, userRole;

  if (jwtSecret) {
    const payload = await verifySupabaseJWT(token, jwtSecret);
    if (!payload?.sub) throw jsonResponse({ error: "Token invalide ou expire" }, 401);
    userId    = payload.sub;
    userEmail = payload.email;
    userRole  = payload.role ?? null;
  } else {
    const sb = adminClient(env);
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) throw jsonResponse({ error: "Token invalide ou expire" }, 401);
    userId    = user.id;
    userEmail = user.email;
  }

  const sb = adminClient(env);

  // Toujours verifier le role depuis profiles (source de verite)
  const { data: profile } = await sb
    .from("profiles")
    .select("role, status, name")
    .eq("id", userId)
    .single();

  userRole = profile?.role ?? "buyer";

  return { user: { id: userId, email: userEmail, role: userRole, name: profile?.name }, sb };
}

// requireAdmin — verifie role admin
export async function requireAdmin(env, request) {
  const { user, sb } = await requireAuth(env, request);
  if (user.role !== "admin")
    throw jsonResponse({ error: "Acces refuse - admin requis" }, 403);
  return { user, sb };
}

// requireRole — accepte string ou tableau de roles
export async function requireRole(env, request, role) {
  const { user, sb } = await requireAuth(env, request);
  const roles = Array.isArray(role) ? role : [role];
  if (roles.includes("admin") && user.role !== "admin")
    throw jsonResponse({ error: "Acces refuse - admin requis" }, 403);
  if (!roles.includes(user.role) && !roles.includes("admin"))
    throw jsonResponse({ error: "Acces refuse" }, 403);
  return { user, sb };
}

// Helper interne
function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
