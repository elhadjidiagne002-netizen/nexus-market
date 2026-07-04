// functions/api/ai.js → POST /api/ai
// Proxy serveur pour l'assistant IA (Groq / OpenAI-compatible chat completions).
// La clé API vit UNIQUEMENT côté serveur (env.GROQ_API_KEY) — jamais dans le
// bundle frontend (public). Remplace les 4 appels client-side qui exposaient la clé.
//
// Cloudflare : Pages → Settings → Variables and Secrets → GROQ_API_KEY = gsk_...
//
// Anti-abus (le proxy est public/anonyme) : rate limit par IP, modèles en liste
// blanche, max_tokens plafonné, stream désactivé (le front lit la réponse complète).
import { options, json, err, CORS } from './_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from './_lib/ratelimit.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Modèles autorisés (empêche d'utiliser le proxy comme relais Groq gratuit pour
// des modèles coûteux). Défaut = celui utilisé partout dans le frontend.
const ALLOWED_MODELS = new Set([
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
]);
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS_CAP = 1500;
const MAX_MESSAGES = 24;
const MAX_CONTENT_CHARS = 24000; // borne la taille d'un message (anti-abus payload)

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  if (!env.GROQ_API_KEY) return err('Assistant IA non configuré (GROQ_API_KEY manquante côté serveur).', 503);

  // ── Anti-abus : 20 requêtes / min par IP (fail-open si le rate limiter tombe) ──
  const rl = await rateLimit(env, `ai:${clientIp(request)}`, 20, 60);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, CORS);

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }

  // ── Validation des messages ─────────────────────────────────────────────────
  const messages = body && body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return err('messages[] requis', 400);
  if (messages.length > MAX_MESSAGES) return err('Trop de messages', 400);
  for (const m of messages) {
    if (!m || typeof m.role !== 'string' || typeof m.content !== 'string')
      return err('Format de message invalide (role/content)', 400);
    if (m.content.length > MAX_CONTENT_CHARS) return err('Message trop long', 400);
  }

  // ── Paramètres bornés ─────────────────────────────────────────────────────────
  const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
  let temperature = Number(body.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) temperature = 0.5;
  let maxTokens = parseInt(body.max_tokens, 10);
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) maxTokens = 600;
  maxTokens = Math.min(maxTokens, MAX_TOKENS_CAP);

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  // Le mode JSON structuré est utilisé par l'extracteur produit / devis B2B.
  if (body.response_format && body.response_format.type === 'json_object') {
    payload.response_format = { type: 'json_object' };
  }

  // ── Appel Groq (clé serveur) ─────────────────────────────────────────────────
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 30000);
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const detail = (data && data.error && data.error.message) || ('Groq ' + r.status);
      console.error('[api/ai] Groq KO:', r.status, detail);
      // Ne pas divulguer d'info sensible ; renvoyer un statut clair au front.
      return json({ error: 'Assistant indisponible', detail: String(detail).slice(0, 200) }, r.status === 429 ? 429 : 502);
    }
    // Réponse au format OpenAI/Groq (choices[0].message.content) — le front la lit tel quel.
    return json(data);
  } catch (e) {
    if (e && e.name === 'AbortError') return err('Assistant : délai dépassé', 504);
    console.error('[api/ai]', e && e.message);
    return err('Erreur assistant', 500);
  }
}
