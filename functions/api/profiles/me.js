import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);

  if (request.method === "GET") {
    const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
    return ok(data);
  }
  if (request.method === "PATCH" || request.method === "PUT") {
    const body = await request.json();
    const allowed = ["name","phone","avatar","bio","logo","shop_name","shop_category","whatsapp_number","opening_hours","return_policy"];
    const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    const { data, error } = await sb.from("profiles").update(update).eq("id", user.id).select().single();
    if (error) return err(error.message);
    return ok(data);
  }
  return err("Méthode non autorisée", 405);
});
