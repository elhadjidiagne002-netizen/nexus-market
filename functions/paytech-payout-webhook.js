/**
 * functions/paytech-payout-webhook.js
 * IPN PayTech pour les mises à jour de statut de transfert vendeur
 */
import { createClient } from "@supabase/supabase-js";

async function sha256hex(str) {
  const encoded = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(rawBody, headerHash, apiKey, apiSecret) {
  if (!apiKey || !apiSecret || !headerHash) return false;
  const expected = await sha256hex(apiKey + apiSecret + rawBody);
  return timingSafeEqual(expected, headerHash.toLowerCase());
}

const STATUS_MAP = {
  sale_complete: "paid",
  transfer_complete: "paid",
  transfer_success: "paid",
  sale_pending: "processing",
  transfer_pending: "processing",
  sale_canceled: "failed",
  transfer_failed: "failed",
  transfer_canceled: "failed",
  sale_reversed: "failed",
};

export async function onRequestPost(context) {
  const { request, env } = context;

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PAYTECH_API_KEY, PAYTECH_API_SECRET } = env;
  if (!SUPABASE_SERVICE_KEY) return new Response("Config error", { status: 503 });

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-paytech-hash") || request.headers.get("x-signature") || "";

  if (signatureHeader) {
    const valid = await verifySignature(rawBody, signatureHeader, PAYTECH_API_KEY, PAYTECH_API_SECRET);
    if (!valid) {
      console.warn("[payout-webhook] Signature invalide");
      return new Response("Forbidden", { status: 403 });
    }
  }

  // Parse du body (json ou form-urlencoded)
  let data = {};
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      data = JSON.parse(rawBody || "{}");
    } else {
      const params = new URLSearchParams(rawBody || "");
      params.forEach((v, k) => { data[k] = v; });
    }
  } catch (e) {
    console.error("[payout-webhook] parse error:", e.message);
    return new Response("Bad Request", { status: 400 });
  }

  const { type_event, ref_command, custom_field, token } = data;

  let payoutId = null;
  try {
    const cf = typeof custom_field === "string" ? JSON.parse(custom_field) : custom_field || {};
    payoutId = cf.payout_id || null;
  } catch (_) {}

  if (!ref_command && !payoutId) {
    return new Response("OK", { status: 200 }); // On ne bloque pas PayTech
  }

  const newStatus = STATUS_MAP[type_event];
  if (!newStatus) {
    return new Response("OK", { status: 200 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Trouver le payout
  let query = sb.from("payout_requests").select("*");
  if (payoutId) query = query.eq("id", payoutId);
  else query = query.eq("ref_command", ref_command);

  const { data: payout, error: fetchErr } = await query.single();
  if (fetchErr || !payout) {
    console.warn("[payout-webhook] Payout introuvable");
    return new Response("OK", { status: 200 });
  }

  // Éviter les régressions de statut
  const ORDER = { pending: 0, processing: 1, paid: 2, failed: 2 };
  if ((ORDER[newStatus] ?? -1) <= (ORDER[payout.status] ?? -1) && newStatus !== "failed") {
    console.log(`[payout-webhook] Régression ignorée ${payout.status} → ${newStatus}`);
    return new Response("OK", { status: 200 });
  }

  // Mise à jour
  const update = {
    status: newStatus,
    paytech_ref: ref_command || payout.paytech_ref,
    ...(token && { paytech_token: token }),
    ...(newStatus === "paid" && { paid_at: new Date().toISOString() }),
    ...(newStatus === "failed" && { failed_at: new Date().toISOString(), failure_reason: type_event }),
  };

  const { error: updateErr } = await sb.from("payout_requests").update(update).eq("id", payout.id);
  if (updateErr) {
    console.error("[payout-webhook] update error:", updateErr.message);
    return new Response("DB Error", { status: 500 });
  }

  // Notification au vendeur
  const messages = {
    paid: `✅ Retrait de ${payout.amount_xof?.toLocaleString("fr-FR")} FCFA effectué.`,
    processing: `⏳ Retrait de ${payout.amount_xof?.toLocaleString("fr-FR")} FCFA en cours.`,
    failed: `❌ Retrait de ${payout.amount_xof?.toLocaleString("fr-FR")} FCFA échoué.`,
  };
  if (messages[newStatus]) {
    await sb.from("notifications").insert({
      user_id: payout.vendor_id,
      type: "payout",
      title: messages[newStatus],
      message: messages[newStatus],
      read: false,
    }).catch(e => console.warn("[payout-webhook] notif:", e.message));
  }

  console.log(`[payout-webhook] ${payout.id} → ${newStatus}`);
  return new Response("OK", { status: 200 });
}
