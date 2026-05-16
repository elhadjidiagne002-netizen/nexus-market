import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);

  const formData = await request.formData().catch(() => null);
  if (!formData) return err("FormData requis");

  const file = formData.get("file");
  if (!file || typeof file === "string") return err("Fichier manquant");

  const ext  = file.name.split(".").pop().toLowerCase();
  const allowed = ["jpg","jpeg","png","webp","gif","pdf"];
  if (!allowed.includes(ext)) return err("Type de fichier non autorisé");

  const path = `uploads/${user.id}/${Date.now()}.${ext}`;
  const buffer = await file.arrayBuffer();

  const { error } = await sb.storage.from("nexus-media").upload(path, buffer, {
    contentType: file.type, upsert: false
  });
  if (error) return err(error.message, 502);

  const { data: { publicUrl } } = sb.storage.from("nexus-media").getPublicUrl(path);
  return ok({ url: publicUrl, path });
});
