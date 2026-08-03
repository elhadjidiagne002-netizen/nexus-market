// ============================================================
// functions/api/_lib/webhook-utils.js
// Helpers PURS partagés pour la vérification des webhooks paiement.
// Extraits pour être testables unitairement (tests/unit/webhook-utils.test.js).
// Aucune dépendance externe → sûrs à importer partout (Workers + node:test).
// ============================================================

// SHA-512 → hex (WebCrypto, natif Workers + Node 20+).
export async function sha512hex(str) {
  const buf = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(str || ''));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// SHA-256 → hex (utilisé par la vérif IPN PayTech).
export async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str || ''));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Comparaison à temps constant (évite un oracle de timing sur le hash/signature).
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// PayDunya (et d'autres) postent en form-encoded avec notation crochets imbriquée
// (data[custom_data][order_id]=…). Reconstruit l'objet imbriqué depuis un
// URLSearchParams (ou tout itérable de paires [clé, valeur]).
export function parseNested(params) {
  const obj = {};
  for (const [k, v] of params) {
    const path = k.replace(/\]/g, '').split('[');
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
      cur[path[i]] = cur[path[i]] || {};
      cur = cur[path[i]];
    }
    cur[path[path.length - 1]] = v;
  }
  return obj;
}
