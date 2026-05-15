// ── GET /api/health ────────────────────────────────────────────────────────
// Endpoint de santé requis par NEXUS_CONFIG._verifyBackend().
// Cloudflare Pages Function — runtime Workers (V8, pas Node.js).

export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
