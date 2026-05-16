import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireAuth(env, request);
  const { code, cartTotal } = await request.json();
  if (!code) return err("Code requis");

  const sb = adminClient(env);
  const { data: coupon } = await sb.from("coupons").select("*").eq("code", code.toUpperCase()).eq("active", true).single();
  if (!coupon) return err("Code promo invalide ou expiré");

  const now = new Date();
  if (coupon.expires_at && new Date(coupon.expires_at) < now) return err("Code promo expiré");
  if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return err("Code promo épuisé");
  if (coupon.min_cart_fcfa && cartTotal < coupon.min_cart_fcfa) return err("Minimum de commande non atteint (" + coupon.min_cart_fcfa + " FCFA)");

  const discount = coupon.type === "percent"
    ? Math.round(cartTotal * coupon.value / 100)
    : coupon.value;

  return ok({ valid: true, coupon, discount });
});
