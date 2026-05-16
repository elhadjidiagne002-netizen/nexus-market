import { options, json, err } from "../_lib/utils.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return options();
  if (request.method !== "GET") return err("Methode non supportee", 405);

  const url = new URL(request.url);
  const ids = url.searchParams.get("ids");
  if (!ids) return err("ids requis", 400);

  const idList = ids.split(",").map(id => id.trim()).filter(Boolean);
  if (idList.length === 0) return err("ids vide", 400);

  const filter = idList.map(id => `id.eq.${id}`).join(",");
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/products?or=(${filter})&select=id,stock,active`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );

  if (!res.ok) return err("Erreur Supabase", 502);

  const rows = await res.json();
  const result = {};
  for (const row of rows) {
    result[row.id] = { stock: row.stock ?? 0, active: row.active ?? true };
  }
  return json(result);
}
