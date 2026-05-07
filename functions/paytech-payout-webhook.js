/**
 * functions/paytech-payout-webhook.js
 * ──────────────────────────────────────────────────────────────────────────
 * IPN PayTech → appelé par PayTech après chaque changement de statut de transfert
 *
 * Adaptation Netlify → Cloudflare :
 *   • Le module Node.js `crypto` est remplacé par l'API Web Crypto (crypto.subtle)
 *     disponible nativement dans les Cloudflare Workers.
 *   • crypto.timingSafeEqual → implémentation manuelle en temps constant.
 *   • process.env → env
 *
 * Variables d'environnement Cloudflare :
 *   SUPABASE_URL         — URL Supabase
 *   SUPABASE_SERVICE_KEY — Clé service_role
 *   PAYTECH_API_KEY      — Clé API PayTech
 *   PAYTECH_API_SECRET   — Secret PayTech
 */

import { createClient } from "@supabase/supabase-js";

// ── Web Crypto : SHA-256 hexadécimal ──────────────────────────────────────
async function sha256hex(str) {
  const encoded   = new TextEncoder().encode(str);
  const hashBuf   = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Comparaison en temps constant (résistante au timing attack) ───────────
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ── Vérification signature PayTech ────────────────────────────────────────
async function verifyPaytechSignature(rawBody, receivedHash, apiKey, apiSecret) {
  if (!apiKey || !apiSecret || !receivedHash) return false;
  const expected = await sha256hex(apiKey + apiSecret + rawBody);
  return timingSafeEqual(expected, receivedHash.toLowerCase());
}

// ── Mapping type_event → statut NEXUS ────────────────────────────────────
function resolveStatus(typeEvent) {
  const map = {
    sale_complete:       "paid",
    transfer_complete:   "paid",
    transfer_success:    "paid",
    sale_pending:        "processing",
    transfer_pending:    "processing",
    sale_canceled:       "failed",
    transfer_failed:     "failed",
    transfer_canceled:   "failed",
    sale_reversed:       "failed",
  };
  return map[typeEvent] || null;
}

// ── Handler ───────────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PAYTECH_API_KEY, PAYTECH_API_SECRET } = env;

  if (!SUPABASE_SERVICE_KEY) {
    console.error("[payout-webhook] SUPABASE_SERVICE_KEY manquante");
    return new Response("Config error", { status: 503 });
  }

  // ── Vérification de la signature ─────────────────────────────────────────
  const rawBody      = await request.text();
  const receivedHash = request.headers.get("x-paytech-hash") || request.headers.get("x-signature") || "";

  if (receivedHash) {
    const valid = await verifyPaytechSignature(rawBody, receivedHash, PAYTECH_API_KEY, PAYTECH_API_SECRET);
    if (!valid) {
      console.warn("[payout-webhook] Signature invalide — requête ignorée");
      return new Response("Forbidden", { status: 403 });
    }
  }

  // ── Parse du body ─────────────────────────────────────────────────────────
  let data = {};
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      data = JSON.parse(rawBody || "{}");
    } else {
      // form-urlencoded
      const params = new URLSearchParams(rawBody || "");
      params.forEach((v, k) => { data[k] = v; });
    }
  } catch (e) {
    console.error("[payout-webhook] parse error:", e.message);
    return new Response("Bad Request", { status: 400 });
  }

  console.log("[payout-webhook] payload:", JSON.stringify(data));

  const { type_event, ref_command, token, custom_field } = data;

  // ── Identifier la demande de payout ──────────────────────────────────────
  let payoutId = null;
  try {
    const cf = typeof custom_field === "string" ? JSON.parse(custom_field) : (custom_field || {});
    payoutId = cf.payout_id || null;
  } catch (_) {}

  if (!ref_command && !payoutId) {
    console.warn("[payout-webhook] Aucune référence identifiable");
    return new Response("OK", { status: 200 }); // 200 pour éviter que PayTech réessaie indéfiniment
  }

  const newStatus = resolveStatus(type_event);
  if (!newStatus) {
    console.warn("[payout-webhook] type_event inconnu:", type_event);
    return new Response("OK", { status: 200 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Trouver le payout en base ─────────────────────────────────────────────
  let query = sb.from("payout_requests").select("*");
  if (payoutId)  query = query.eq("id",         payoutId);
  else           query = query.eq("ref_command", ref_command);

  const { data: payout, error: fetchErr } = await query.single();

  if (fetchErr || !payout) {
    console.warn("[payout-webhook] payout introuvable:", fetchErr?.message);
    return new Response("OK", { status: 200 });
  }

  // Éviter les régressions de statut
  const ORDER = { pending: 0, processing: 1, paid: 2, failed: 2 };
  if ((ORDER[newStatus] ?? -1) <= (ORDER[payout.status] ?? -1) && newStatus !== "failed") {
    console.log(`[payout-webhook] ${payout.status} → ${newStatus} ignoré (régression)`);
    return new Response("OK", { status: 200 });
  }

  // ── Mise à jour en base ───────────────────────────────────────────────────
  const updateData = {
    status:      newStatus,
    paytech_ref: ref_command || payout.paytech_ref,
    ...(token && { paytech_token: token }),
    ...(newStatus === "paid"   && { paid_at:        new Date().toISOString() }),
    ...(newStatus === "failed" && { failed_at:      new Date().toISOString(), failure_reason: type_event }),
  };

  const { error: updateErr } = await sb
    .from("payout_requests")
    .update(updateData)
    .eq("id", payout.id);

  if (updateErr) {
    console.error("[payout-webhook] update error:", updateErr.message);
    return new Response("DB Error", { status: 500 });
  }

  // ── Notification vendeur ──────────────────────────────────────────────────
  const FCFA = payout.amount_xof?.toLocaleString("fr-FR") || "—";
  const msgs = {
    paid:       { title: "✅ Retrait effectué",  msg: `${FCFA} FCFA ont été envoyés sur votre ${payout.provider || "compte"}` },
    processing: { title: "⏳ Retrait en cours",  msg: `Votre retrait de ${FCFA} FCFA est en cours de traitement` },
    failed:     { title: "❌ Retrait échoué",     msg: `Votre demande de ${FCFA} FCFA n'a pas pu être traitée. Réessayez.` },
  };
  const notif = msgs[newStatus];
  if (notif) {
    await sb.from("notifications").insert({
      user_id: payout.vendor_id,
      type:    "payout",
      title:   notif.title,
      message: notif.msg,
      read:    false,
    }).catch(e => console.warn("[payout-webhook] notif:", e.message));
  }

  console.log(`[payout-webhook] Payout ${payout.id} → ${newStatus}`);
  return new Response("OK", { status: 200 });
}
