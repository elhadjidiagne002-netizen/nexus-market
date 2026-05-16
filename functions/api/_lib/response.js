// functions/api/_lib/response.js

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

// Reponse JSON standard
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Alias ok() -> json() 200
export function ok(data) {
  return json(data, 200);
}

// Reponse d'erreur JSON
export function errorResponse(message, status = 400) {
  return json({ error: message }, status);
}

// Alias err() -> errorResponse()
export function err(message, status = 400) {
  return errorResponse(message, status);
}

// Reponse CSV telechargeable
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

// Reponse preflight CORS
export function corsOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// Wrapper generique pour CF Pages Functions
export function handle(fn) {
  return async (ctx) => {
    if (ctx.request.method === "OPTIONS") return corsOptions();
    try {
      return await fn(ctx);
    } catch (e) {
      console.error("[handle]", e);
      return errorResponse(e.message ?? "Erreur interne", 500);
    }
  };
}
