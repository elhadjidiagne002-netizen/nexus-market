import { handle, ok } from "./_lib/response.js";
export const onRequest = handle(async ({ env }) => {
  return ok({ status: "ok", timestamp: new Date().toISOString(), version: "1.0.0" });
});
