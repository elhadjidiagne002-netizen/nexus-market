import { adminClient } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const body = await request.json();
  const { email, password, name, role = "buyer", shopName, shopCategory, ninea, rc, phone } = body;
  if (!email || !password || !name) return err("Champs requis manquants");

  const sb = adminClient(env);

  // Create auth user
  const { data, error } = await sb.auth.admin.createUser({
    email, password, email_confirm: false,
    user_metadata: { name, role }
  });
  if (error) return err(error.message, 400);

  const userId = data.user.id;

  // Create profile
  const profileData = { id: userId, email, name, role, phone: phone || null };
  if (role === "vendor") {
    Object.assign(profileData, { shop_name: shopName, shop_category: shopCategory, ninea, rc, status: "pending" });
    await sb.from("pending_vendors").insert({ user_id: userId, name, email, shop_name: shopName, shop_category: shopCategory, ninea, rc, phone });
  }
  await sb.from("profiles").upsert(profileData);

  // Send confirmation email via Supabase
  await sb.auth.admin.generateLink({ type: "signup", email }).catch(() => {});

  return ok({ message: "Compte créé", userId }, 201);
});
