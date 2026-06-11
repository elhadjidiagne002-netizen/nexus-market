/**
 * NEXUS Market — Cron : RÉCONCILIATION DES STORIES (Mux)
 * ──────────────────────────────────────────────────────────────────────────
 * Filet quand le webhook Mux (video.asset.ready) n'est pas configuré/déclenché :
 * les stories restent 'uploading' sans mux_playback_id → jamais affichées.
 * Ce cron interroge l'API Mux pour chaque story en attente et l'active dès que
 * l'asset est 'ready' (playback_id obtenu). Marque 'errored' si l'encodage échoue.
 *
 * Déclencher par GET externe toutes les 2–5 min :
 *   GET https://nexus-market-asb.pages.dev/cron/reconcile-stories?token=CRON_SECRET
 *
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_KEY, MUX_TOKEN_ID, MUX_TOKEN_SECRET,
 *             CRON_SECRET (ou NEXUS_WA_SECRET).
 * ──────────────────────────────────────────────────────────────────────────
 */

const jsonR = (d, s = 200) => new Response(JSON.stringify(d, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } });

export async function onRequestGet({ request, env }) {
  const token  = new URL(request.url).searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) return jsonR({ error: 'Non autorisé — ?token=requis' }, 401);
  return jsonR(await reconcile(env));
}

export default { async scheduled(event, env, ctx) { ctx.waitUntil(reconcile(env)); } };

async function reconcile(env) {
  const SB = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY;
  const out = { run_at: new Date().toISOString(), checked: 0, activated: 0, errored: 0, pending: 0, errors: [] };
  if (!KEY) return { ...out, error: 'SUPABASE_SERVICE_KEY manquante' };
  if (!env.MUX_TOKEN_ID || !env.MUX_TOKEN_SECRET) return { ...out, error: 'MUX non configuré (MUX_TOKEN_ID/SECRET)' };

  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  const muxAuth = 'Basic ' + btoa(`${env.MUX_TOKEN_ID}:${env.MUX_TOKEN_SECRET}`);
  const since = new Date(Date.now() - 2 * 86400000).toISOString();

  let stories = [];
  try {
    const q = `${SB}/rest/v1/stories?select=id,mux_upload_id,mux_asset_id,status,created_at`
      + `&status=eq.uploading&mux_upload_id=not.is.null&created_at=gte.${since}&limit=50`;
    const r = await fetch(q, { headers: H });
    stories = r.ok ? await r.json() : [];
  } catch (e) { return { ...out, error: 'Lecture stories: ' + e.message }; }

  for (const s of stories) {
    out.checked++;
    try {
      // 1) Résoudre l'asset_id depuis l'upload si pas encore connu.
      let assetId = s.mux_asset_id;
      if (!assetId) {
        const ur = await fetch(`https://api.mux.com/video/v1/uploads/${encodeURIComponent(s.mux_upload_id)}`, { headers: { Authorization: muxAuth } });
        if (ur.ok) { const ud = await ur.json(); assetId = ud.data && ud.data.asset_id; }
      }
      if (!assetId) { out.pending++; continue; }

      // 2) État de l'asset.
      const ar = await fetch(`https://api.mux.com/video/v1/assets/${encodeURIComponent(assetId)}`, { headers: { Authorization: muxAuth } });
      if (!ar.ok) { out.pending++; continue; }
      const ad = (await ar.json()).data || {};
      if (ad.status === 'ready') {
        const playback = ad.playback_ids && ad.playback_ids[0] && ad.playback_ids[0].id;
        if (!playback) { out.pending++; continue; }
        const up = await fetch(`${SB}/rest/v1/stories?id=eq.${encodeURIComponent(s.id)}`, {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ mux_asset_id: assetId, mux_playback_id: playback, duration: ad.duration || null, status: 'active' }),
        });
        up.ok ? out.activated++ : out.errors.push(`story ${s.id}: HTTP ${up.status}`);
      } else if (ad.status === 'errored') {
        await fetch(`${SB}/rest/v1/stories?id=eq.${encodeURIComponent(s.id)}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'errored' }) });
        out.errored++;
      } else { out.pending++; }
    } catch (e) { out.errors.push(`story ${s.id}: ${e.message}`); }
  }

  console.log('[reconcile-stories]', JSON.stringify(out));
  return out;
}
