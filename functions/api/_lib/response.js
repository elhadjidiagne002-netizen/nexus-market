// functions/api/_lib/response.js

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

// ok(data, status?) — reponse JSON succes
export function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Alias json()
export function json(data, status = 200) {
  return ok(data, status);
}

// err(message, status?) — reponse JSON erreur
export function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Alias errorResponse()
export function errorResponse(message, status = 400) {
  return err(message, status);
}

// csvResponse(content, filename)
export function csvResponse(csvContent, filename = "export.csv") {
  return new Response("\uFEFF" + csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      ...CORS,
    },
  });
}

// corsOptions() — reponse preflight
export function corsOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// handle(fn) — wrapper CF Pages Function
// Gere OPTIONS, catch les Response levees (ex: requireAuth throw) et les exceptions
export function handle(fn) {
  return async (ctx) => {
    if (ctx.request.method === "OPTIONS") return corsOptions();
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error("[handle]", e);
      return err(e.message ?? "Erreur interne", 500);
    }
  };
}
