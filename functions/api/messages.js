import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const { data, error } = await sb.from("messages").select("*, profiles!from_id(name,avatar), profiles!to_id(name,avatar)").or("from_id.eq." + user.id + ",to_id.eq." + user.id).order("created_at", { ascending: true });
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "POST") {
    const body = await request.json();
    const { data, error } = await sb.from("messages").insert({ ...body, from_id: user.id, read: false }).select().single();
    if (error) return err(error.message);
    return ok(data, 201);
  }

  return err("Méthode non autorisée", 405);
});
