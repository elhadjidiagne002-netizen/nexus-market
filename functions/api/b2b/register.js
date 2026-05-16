import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireAuth(env, request);
  const body = await request.json();
  const { company, ninea, rc, address, phone, sector } = body;
  if (!company || !ninea) return err("Raison sociale et NINEA requis");

  const sb = adminClient(env);
  const { data, error } = await sb.from("b2b_profiles").upsert({
    user_id: user.id, company, ninea, rc, address, phone, sector,
    verified: false, discount_rate: 0, tier: "standard", created_at: new Date().toISOString()
  }).select().single();
  if (error) return err(error.message);
  await sb.from("profiles").update({ role: "buyer_pro", company }).eq("id", user.id);
  return ok(data, 201);
});
