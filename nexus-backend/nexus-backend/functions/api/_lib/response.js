export const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
  "Access-Control-Max-Age":       "86400",
};

export function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}

export function err(msg, status = 400, detail = null) {
  return new Response(JSON.stringify({ error: msg, detail }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export function handle(fn) {
  return async (context) => {
    if (context.request.method === "OPTIONS") return preflight();
    try {
      return await fn(context);
    } catch (e) {
      if (e?.status) return err(e.message, e.status);
      console.error(e);
      return err("Erreur serveur interne", 500, e?.message);
    }
  };
}
