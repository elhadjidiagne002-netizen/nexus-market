import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const sb = adminClient(env);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const productId = url.searchParams.get("product_id");
    const vendorId  = url.searchParams.get("vendor_id");
    let q = sb.from("reviews").select("*, profiles!user_id(name,avatar)").order("created_at", { ascending: false });
    if (productId) q = q.eq("product_id", productId);
    if (vendorId)  q = q.eq("vendor_id", vendorId);
    const { data, error } = await q.limit(100);
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "POST") {
    const { user } = await requireAuth(env, request);
    const body = await request.json();
    // Check if already reviewed
    const { data: existing } = await sb.from("reviews").select("id").eq("user_id", user.id).eq("product_id", body.product_id).single();
    if (existing) return err("Vous avez déjà laissé un avis pour ce produit");
    const { data, error } = await sb.from("reviews").insert({ ...body, user_id: user.id }).select().single();
    if (error) return err(error.message);
    // Update product average rating
    const { data: allReviews } = await sb.from("reviews").select("rating").eq("product_id", body.product_id);
    const avg = (allReviews || []).reduce((s, r) => s + r.rating, 0) / (allReviews?.length || 1);
    await sb.from("products").update({ rating: avg, reviews_count: allReviews?.length || 1 }).eq("id", body.product_id);
    return ok(data, 201);
  }

  return err("Méthode non autorisée", 405);
});
