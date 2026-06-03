// functions/api/_lib/ratelimit.js
// Rate limiting backé par Postgres (RPC rate_limit_hit, cf. migration
// 2026_06_03_rate_limits.sql). Fail-OPEN : si la base est indisponible, on
// autorise la requête plutôt que de casser le service (le rate limit est une
// protection anti-abus, pas un contrôle de sécurité critique).
import { supabase } from './utils.js';

/** Identifiant client (IP) pour la clé de rate limit. */
export function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * Incrémente et évalue le compteur pour `key`.
 * @returns {Promise<{allowed:boolean, remaining:number, resetAt:string|null}>}
 */
export async function rateLimit(env, key, max, windowSeconds) {
  try {
    const sb = supabase(env);
    const rows = await sb.rpc('rate_limit_hit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    const r = Array.isArray(rows) ? rows[0] : rows;
    return {
      allowed: r?.allowed !== false,
      remaining: r?.remaining ?? 0,
      resetAt: r?.reset_at ?? null,
    };
  } catch {
    return { allowed: true, remaining: 0, resetAt: null }; // fail-open
  }
}

/** Construit une réponse 429 standard avec en-têtes Retry-After. */
export function tooManyRequests(resetAt, extraHeaders = {}) {
  const retryAfter = resetAt
    ? Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1000))
    : 60;
  return new Response(
    JSON.stringify({ error: 'Trop de requêtes, réessayez plus tard.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        ...extraHeaders,
      },
    }
  );
}
