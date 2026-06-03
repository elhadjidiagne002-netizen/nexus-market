// functions/api/_lib/validate.js
// Validateurs d'entrées partagés (réutilisés par les endpoints SMS/WhatsApp,
// couverts par tests/unit/validate.test.js).

/** Retire tout caractère non numérique. Sûr sur null/undefined. */
export function normalizePhone(input) {
  return String(input ?? '').replace(/\D/g, '');
}

/** Téléphone valide = 8 à 15 chiffres (E.164 sans le +). */
export function isValidPhone(input) {
  const d = normalizePhone(input);
  return d.length >= 8 && d.length <= 15;
}

/** Message non vide, chaîne, longueur ≤ max. */
export function isValidMessage(input, max = 1000) {
  return typeof input === 'string' && input.length > 0 && input.length <= max;
}
