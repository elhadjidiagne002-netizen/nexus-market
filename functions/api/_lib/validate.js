// functions/api/_lib/validate.js
// Validateurs d'entrées partagés (réutilisés par les endpoints SMS/WhatsApp,
// couverts par tests/unit/validate.test.js).
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Retire tout caractère non numérique. Sûr sur null/undefined. */
export function normalizePhone(input) {
  return String(input ?? '').replace(/\D/g, '');
}

/** Téléphone valide = 8 à 15 chiffres (E.164 sans le +). */
export function isValidPhone(input) {
  const d = normalizePhone(input);
  return d.length >= 8 && d.length <= 15;
}

/**
 * Normalise un numéro en **E.164 SANS le `+`** (ex. `221771234567`), pour un
 * routage fiable WhatsApp (chatId) / SMS. S'appuie sur libphonenumber-js avec le
 * Sénégal par défaut → gère les formats locaux (`77 123 45 67`), `+221`, espaces,
 * tirets, `00221`… Repli sur l'ancienne heuristique si le parsing échoue :
 * JAMAIS plus strict que l'existant (aucun numéro auparavant accepté n'est perdu).
 * @param {string} input  numéro brut
 * @param {string} country  pays par défaut (ISO-2), défaut 'SN'
 */
export function toE164(input, country = 'SN') {
  const raw = normalizePhone(input);
  try {
    const pn = parsePhoneNumberFromString(String(input ?? ''), country);
    if (pn && pn.isValid()) return pn.number.replace(/^\+/, '');
  } catch (_) { /* repli ci-dessous */ }
  // Repli historique : numéro local sénégalais à 9 chiffres → préfixe 221.
  if (raw.startsWith('221')) return raw;
  if (raw.length === 9) return '221' + raw;
  return raw;
}

/** Message non vide, chaîne, longueur ≤ max. */
export function isValidMessage(input, max = 1000) {
  return typeof input === 'string' && input.length > 0 && input.length <= max;
}
