import { adminClient, requireRole } from "../../_lib/supabase.js";
import { handle, ok, err } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env, params }) => {
  const { user } = await requireRole(env, request, ["admin"]);
  const userId = params.userId;
  const sb = adminClient(env);

  const { data: b2b } = await sb.from("b2b_profiles").select("ninea,company").eq("user_id", userId).single();
  if (!b2b) return err("Profil B2B introuvable", 404);

  // Check APIX/DGI Sénégal registry (if configured)
  let verified = false, registryData = null;
  if (env.APIX_API_KEY) {
    const res = await fetch("https://api.apix.sn/registry/ninea/" + b2b.ninea, {
      headers: { "X-API-Key": env.APIX_API_KEY }
    }).catch(() => null);
    if (res?.ok) {
      registryData = await res.json();
      verified = !!registryData?.active;
    }
  }

  return ok({ ninea: b2b.ninea, verified, registry: registryData, note: env.APIX_API_KEY ? null : "APIX non configuré — vérification manuelle requise" });
});
