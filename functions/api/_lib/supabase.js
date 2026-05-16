// functions/api/_lib/supabase.js
import { createClient } from "@supabase/supabase-js";

// ─── Client admin (contourne RLS) ────────────────────────────────────────────
export function adminClient(env) {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}
export const createSupabaseClient = adminClient;

// ─── Extraction du Bearer token ───────────────────────────────────────────────
export function extractToken(request) {
  return (request.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

// ─── Vérification JWT locale (CF Workers crypto — ZERO latence réseau) ────────
// Supabase signe ses JWT avec HS256 et le SUPABASE_JWT_SECRET.
// On vérifie la signature directement dans le Worker sans appel HTTP.
async function verifySupabaseJWT(token, jwtSecret) {
  const [headerB64, payloadB64, sigB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = Uint8Array.from(
    atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    enc.encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) return null;

  const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));

  // Vérifier expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload; // { sub, email, role, exp, ... }
}

// ─── requireAuth ─────────────────────────────────────────────────────────────
// Retourne { user, sb } — vérifie JWT localement, récupère le rôle depuis
// profiles UNE seule fois si nécessaire (pas d'appel Supabase /auth/v1/user).
export async function requireAuth(env, request) {
  const token = extractToken(request);
  if (!token) throw jsonResponse({ error: "Non authentifié" }, 401);

  const jwtSecret = env.SUPABASE_JWT_SECRET;

  let userId, userEmail, userRole;

  if (jwtSecret) {
    // ✅ Vérification locale — rapide, zéro réseau
    const payload = await verifySupabaseJWT(token, jwtSecret);
    if (!payload?.sub) throw jsonResponse({ error: "Token invalide ou expiré" }, 401);
    userId    = payload.sub;
    userEmail = payload.email;
    userRole  = payload.role ?? null; // role injecté dans le JWT si configuré
  } else {
    // Fallback : délégation Supabase (si SUPABASE_JWT_SECRET absent)
    const sb = adminClient(env);
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) throw jsonResponse({ error: "Token invalide ou expiré" }, 401);
    userId    = user.id;
    userEmail = user.email;
  }

  const sb = adminClient(env);

  // Récupérer le rôle depuis profiles si pas dans le JWT
  if (!userRole) {
    const { data: profile } = await sb
      .from("profiles")
      .select("role, status")
      .eq("id", userId)
      .single();
    userRole = profile?.role ?? "buyer";
  }

  return {
    user: { id: userId, email: userEmail, role: userRole },
    sb,
  };
}

// ─── requireAdmin ─────────────────────────────────────────────────────────────
export async function requireAdmin(env, request) {
  const { user, sb } = await requireAuth(env, request);
  if (user.role !== "admin")
    throw jsonResponse({ error: "Accès refusé — admin requis" }, 403);
  return { user, sb };
}

// ─── requireRole ─────────────────────────────────────────────────────────────
export async function requireRole(env, request, role) {
  if (role === "admin") return requireAdmin(env, request);
  return requireAuth(env, request);
}

// ─── Helper interne ──────────────────────────────────────────────────────────
function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
