import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const sb = adminClient(env);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const category = url.searchParams.get("category");
    const status   = url.searchParams.get("status") || "open";
    const limit    = parseInt(url.searchParams.get("limit") || "50");
    const buyerId  = url.searchParams.get("buyer_id");

    let q = sb.from("buyer_requests")
      .select("*, profiles!buyer_id(name, avatar, phone, whatsapp_number, whatsapp_prefix), vendor_offers_count:vendor_offers(count)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status)   q = q.eq("status", status);
    if (category) q = q.eq("category", category);
    if (buyerId)  q = q.eq("buyer_id", buyerId);

    const { data, error } = await q;
    if (error) return err(error.message);

    // Enrich with offer count
    const enriched = (data||[]).map(r => ({
      ...r,
      offers_count: r.vendor_offers_count?.[0]?.count || 0
    }));

    return ok(enriched);
  }

  if (request.method === "POST") {
    const { user } = await requireAuth(env, request);
    const body = await request.json();
    const { title, category, description, budget_max, budget_min, quantity, urgency, localisation, images } = body;
    if (!title?.trim()) return err("Titre requis");

    const { data: profile } = await sb.from("profiles").select("name").eq("id", user.id).single();

    const { data, error } = await sb.from("buyer_requests").insert({
      buyer_id:   user.id,
      buyer_name: profile?.name || "Acheteur",
      title: title.trim(), category, description,
      budget_max: budget_max ? parseFloat(budget_max) : null,
      budget_min: budget_min ? parseFloat(budget_min) : null,
      quantity:   parseInt(quantity) || 1,
      urgency:    urgency || "normal",
      localisation: localisation || "Dakar",
      images: images || [],
      status: "open",
      expires_at: new Date(Date.now() + 7*86400000).toISOString()
    }).select().single();

    if (error) return err(error.message);

    // Notify vendors in that category
    const { data: vendors } = await sb.from("profiles")
      .select("id").eq("role","vendor").eq("status","approved")
      .eq("shop_category", category).limit(100);

    if (vendors?.length) {
      const notifs = vendors.map(v => ({
        user_id: v.id, type: "ondemand",
        title: "🔥 Nouvelle demande OnDemand",
        message: `Un acheteur cherche : "${title}"${category ? ` (${category})` : ""}. Budget: ${budget_max ? Math.round(budget_max).toLocaleString("fr-FR") + " FCFA" : "Non précisé"}.`,
        data: { request_id: data.id }
      }));
      await sb.from("notifications").insert(notifs).catch(() => {});
    }

    return ok(data, 201);
  }

  if (request.method === "PATCH") {
    const { user } = await requireAuth(env, request);
    const id = url.searchParams.get("id");
    if (!id) return err("id requis");
    const body = await request.json();
    const allowed = ["status","title","description","budget_max","budget_min","urgency","category","localisation","images"];
    const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    const { data, error } = await sb.from("buyer_requests").update(update).eq("id", id).eq("buyer_id", user.id).select().single();
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "DELETE") {
    const { user } = await requireAuth(env, request);
    const id = url.searchParams.get("id");
    await sb.from("buyer_requests").update({ status: "cancelled" }).eq("id", id).eq("buyer_id", user.id);
    return ok({ cancelled: true });
  }

  return err("Méthode non autorisée", 405);
});
