// functions/api/_lib/bots-config.js
// Interrupteur marche/arrêt par bot (WhatsApp/Telegram/Messenger), piloté depuis
// le panneau admin. Stocké dans app_config (clé unique 'nexus_bots_cfg'), lu par
// chaque webhook AVANT de générer/envoyer une réponse — permet de couper un bot
// sans toucher au code ni aux secrets (utile en cas d'abus ou de maintenance).
// Fail-open volontaire : si Supabase est indisponible, les bots restent actifs
// (mieux vaut répondre que rester muet à cause d'un souci de lecture config).
import { supabase } from './utils.js';

const CONFIG_KEY = 'nexus_bots_cfg';
const DEFAULTS = { whatsapp: true, telegram: true, messenger: true };

export async function getBotsConfig(env) {
  try {
    const sb = supabase(env);
    const rows = await sb.from('app_config').select('value', `key=eq.${CONFIG_KEY}`);
    const value = Array.isArray(rows) && rows[0] && rows[0].value;
    return { ...DEFAULTS, ...(value || {}) };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

export async function isBotEnabled(env, botKey) {
  const cfg = await getBotsConfig(env);
  return cfg[botKey] !== false;
}

export async function setBotEnabled(env, botKey, enabled) {
  const sb = supabase(env);
  const current = await getBotsConfig(env);
  const next = { ...current, [botKey]: !!enabled };
  await sb.from('app_config').upsert([{ key: CONFIG_KEY, value: next }], 'key');
  return next;
}
