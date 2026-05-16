import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const sb = adminClient(env);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const requestId = url.searchParams.get("request_id");
    const vendorId  = url.searchParams.get("vendor_id");
    const { user }  = await requireAuth(env, request);

    let q = sb.from("vendor_offers")
      .select("*, profiles!vendor_id(name, shop_name, logo, rating, whatsapp_number, whatsapp_prefix, phone)")
      .order("created_at", { ascending: false });

    if (requestId) q = q.eq("original_offer_id", requestId); // reuse field as request_id
    if (vendorId)  q = q.eq("vendor_id", vendorId);

    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data || []);
  }

  if (request.method === "POST") {
    const { user } = await requireAuth(env, request);
    const { request_id, price, delivery_days, message, images } = await request.json();
    if (!request_id || !price) return err("request_id et price requis");

    // Check vendor hasn't already offered
    const { data: existing } = await sb.from("vendor_offers")
      .select("id").eq("original_offer_id", request_id).eq("vendor_id", user.id).single();
    if (existing) return err("Vous avez déjà soumis une offre pour cette demande");

    const { data: profile } = await sb.from("profiles").select("name,shop_name,rating,whatsapp_number,whatsapp_prefix,phone").eq("id", user.id).single();
    const { data: buyerReq } = await sb.from("buyer_requests").select("buyer_id,title").eq("id", request_id).single();
    if (!buyerReq) return err("Demande introuvable", 404);

    const { data, error } = await sb.from("vendor_offers").insert({
      vendor_id:        user.id,
      buyer_id:         buyerReq.buyer_id,
      original_offer_id: request_id,  // reuse field as request FK
      counter_price:    parseFloat(price),
      message:          message || null,
      status:           "pending",
      expires_at:       new Date(Date.now() + 3*86400000).toISOString(),
      // Extra denormalized fields
      vendor_name:      profile?.shop_name || profile?.name,
      delivery_days:    parseInt(delivery_days) || null,
      images:           images || []
    }).select().single();

    if (error) return err(error.message);

    // Update request: status → offers_received, increment count
    await sb.from("buyer_requests").update({ status: "offers_received" }).eq("id", request_id).eq("status", "open");

    // Notify buyer
    if (buyerReq.buyer_id) {
      await sb.from("notifications").insert({
        user_id: buyerReq.buyer_id, type: "ondemand_offer",
        title: "💼 Nouvelle offre reçue !",
        message: `${profile?.shop_name || profile?.name} a soumis une offre de ${Math.round(price).toLocaleString("fr-FR")} FCFA pour "${buyerReq.title}".`,
        data: { request_id, offer_id: data.id }
      }).catch(() => {});
    }

    return ok(data, 201);
  }

  if (request.method === "PATCH") {
    const { user } = await requireAuth(env, request);
    const id = url.searchParams.get("id");
    const { status } = await request.json();
    if (!["accepted","rejected"].includes(status)) return err("status doit être accepted ou rejected");

    const { data: offer } = await sb.from("vendor_offers").select("original_offer_id,vendor_id,counter_price").eq("id", id).single();
    if (!offer) return err("Offre introuvable", 404);

    // Only buyer of this request can accept/reject
    const { data: req } = await sb.from("buyer_requests").select("buyer_id,title").eq("id", offer.original_offer_id).single();
    if (req?.buyer_id !== user.id) return err("Non autorisé", 403);

    await sb.from("vendor_offers").update({ status, accepted_at: status==="accepted"?new Date().toISOString():null }).eq("id", id);

    if (status === "accepted") {
      // Reject other offers
      await sb.from("vendor_offers").update({ status: "rejected" }).eq("original_offer_id", offer.original_offer_id).neq("id", id);
      await sb.from("buyer_requests").update({ status: "accepted" }).eq("id", offer.original_offer_id);

      // Notify vendor
      await sb.from("notifications").insert({
        user_id: offer.vendor_id, type: "ondemand_accepted",
        title: "✅ Votre offre a été acceptée !",
        message: `L'acheteur a accepté votre offre de ${Math.round(offer.counter_price).toLocaleString("fr-FR")} FCFA pour "${req?.title}". Contactez-le pour finaliser.`,
        data: { request_id: offer.original_offer_id }
      }).catch(() => {});
    }

    return ok({ updated: true, status });
  }

  return err("Méthode non autorisée", 405);
});
