// /.netlify/functions/paytech-payout-webhook
// IPN PayTech → appelé par PayTech après chaque changement de statut de transfert
//
// PayTech envoie un POST avec les paramètres :
//   type_event, ref_command, item_price, command_name,
//   payment_method, client_phone, token, custom_field, ...
//
// ⚠️  Vérification HMAC-SHA256 obligatoire

const { createClient } = require("@supabase/supabase-js");
const crypto           = require("crypto");

const SUPABASE_URL     = process.env.SUPABASE_URL     || "https://pqcqbstbdujzaclsiosv.supabase.co";
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;
const PAYTECH_API_KEY  = process.env.PAYTECH_API_KEY;
const PAYTECH_API_SECRET = process.env.PAYTECH_API_SECRET;

// ── Vérification signature PayTech ────────────────────────────────────────────
function verifyPaytechSignature(body, receivedHash) {
  if (!PAYTECH_API_KEY || !PAYTECH_API_SECRET) return false;
  // PayTech signe : SHA256(api_key + api_secret + body_brut)
  const expected = crypto
    .createHash("sha256")
    .update(PAYTECH_API_KEY + PAYTECH_API_SECRET + body)
    .digest("hex");
  // Comparaison sécurisée (résistante au timing attack)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected,      "hex"),
      Buffer.from(receivedHash,  "hex")
    );
  } catch (_) { return false; }
}

// ── Mapping statut PayTech → statut NEXUS ────────────────────────────────────
function resolveStatus(typeEvent) {
  const map = {
    // Transfert confirmé
    "sale_complete":          "paid",
    "transfer_complete":      "paid",
    "transfer_success":       "paid",
    // En cours de traitement chez l'opérateur
    "sale_pending":           "processing",
    "transfer_pending":       "processing",
    // Échec / annulation
    "sale_canceled":          "failed",
    "transfer_failed":        "failed",
    "transfer_canceled":      "failed",
    "sale_reversed":          "failed",
  };
  return map[typeEvent] || null;
}

exports.handler = async (event) => {
  // PayTech envoie des POST (IPN = Instant Payment Notification)
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!SUPABASE_SERVICE) {
    console.error("[payout-webhook] SUPABASE_SERVICE_KEY manquante");
    return { statusCode: 503, body: "Config error" };
  }

  // ── Vérification de la signature ─────────────────────────────────────────
  const receivedHash = event.headers?.["x-paytech-hash"] || event.headers?.["x-signature"] || "";
  if (receivedHash && !verifyPaytechSignature(event.body || "", receivedHash)) {
    console.warn("[payout-webhook] Signature invalide — requête ignorée");
    return { statusCode: 403, body: "Forbidden" };
  }

  // ── Parse du body ─────────────────────────────────────────────────────────
  let data = {};
  try {
    const ct = event.headers?.["content-type"] || "";
    if (ct.includes("application/json")) {
      data = JSON.parse(event.body || "{}");
    } else {
      // form-urlencoded (format alternatif PayTech)
      const params = new URLSearchParams(event.body || "");
      params.forEach((v, k) => { data[k] = v; });
    }
  } catch (e) {
    console.error("[payout-webhook] parse error:", e.message);
    return { statusCode: 400, body: "Bad Request" };
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
    return { statusCode: 200, body: "OK" }; // 200 pour éviter que PayTech retire
  }

  // ── Résoudre le nouveau statut ────────────────────────────────────────────
  const newStatus = resolveStatus(type_event);
  if (!newStatus) {
    console.warn("[payout-webhook] type_event inconnu :", type_event);
    return { statusCode: 200, body: "OK" };
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Trouver le payout en base ─────────────────────────────────────────────
  let query = sb.from("payout_requests").select("*");
  if (payoutId)    query = query.eq("id",          payoutId);
  else             query = query.eq("ref_command",  ref_command);
  const { data: payout, error: fetchErr } = await query.single();

  if (fetchErr || !payout) {
    console.warn("[payout-webhook] payout introuvable:", fetchErr?.message);
    return { statusCode: 200, body: "OK" };
  }

  // Éviter les régressions de statut (paid ne peut pas revenir à processing)
  const ORDER = { pending: 0, processing: 1, paid: 2, failed: 2 };
  if ((ORDER[newStatus] ?? -1) <= (ORDER[payout.status] ?? -1) && newStatus !== "failed") {
    console.log(`[payout-webhook] Statut ${payout.status} → ${newStatus} ignoré (régression)`);
    return { statusCode: 200, body: "OK" };
  }

  // ── Mise à jour en base ───────────────────────────────────────────────────
  const updateData = {
    status:      newStatus,
    paytech_ref: ref_command || payout.paytech_ref,
    ...(token && { paytech_token: token }),
    ...(newStatus === "paid"   && { paid_at:   new Date().toISOString() }),
    ...(newStatus === "failed" && { failed_at: new Date().toISOString(), failure_reason: type_event }),
  };

  const { error: updateErr } = await sb
    .from("payout_requests")
    .update(updateData)
    .eq("id", payout.id);

  if (updateErr) {
    console.error("[payout-webhook] update error:", updateErr.message);
    return { statusCode: 500, body: "DB Error" };
  }

  // ── Notification vendeur ──────────────────────────────────────────────────
  const FCFA = payout.amount_xof?.toLocaleString("fr-FR") || "—";
  const msgs = {
    paid:       { title: "✅ Retrait effectué",    msg: `${FCFA} FCFA ont été envoyés sur votre ${payout.provider || "compte"}` },
    processing: { title: "⏳ Retrait en cours",    msg: `Votre retrait de ${FCFA} FCFA est en cours de traitement` },
    failed:     { title: "❌ Retrait échoué",       msg: `Votre demande de ${FCFA} FCFA n'a pas pu être traitée. Réessayez.` },
  };
  const notif = msgs[newStatus];
  if (notif) {
    await sb.from("notifications").insert({
      user_id: payout.vendor_id,
      type:    "payout",
      title:   notif.title,
      message: notif.msg,
      read:    false,
    }).catch(e => console.warn("[payout-webhook] notif error:", e.message));
  }

  console.log(`[payout-webhook] Payout ${payout.id} → ${newStatus}`);
  return { statusCode: 200, body: "OK" };
};
