// functions/api/admin/bots-toggle.js — POST, admin-only
// Active/désactive un bot (whatsapp|telegram|messenger) depuis le panneau admin.
// Body: { bot: 'whatsapp'|'telegram'|'messenger', enabled: boolean }
import { json, err, requireAdmin, options } from '../_lib/utils.js';
import { setBotEnabled } from '../_lib/bots-config.js';

const VALID_BOTS = new Set(['whatsapp', 'telegram', 'messenger']);

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  const [, errResp] = await requireAdmin(request, env);
  if (errResp) return errResp;

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }

  if (!VALID_BOTS.has(body.bot)) return err('bot invalide (whatsapp|telegram|messenger)', 400);

  const cfg = await setBotEnabled(env, body.bot, !!body.enabled);
  return json({ ok: true, config: cfg });
}
