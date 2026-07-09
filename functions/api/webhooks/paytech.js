// ============================================================
// functions/api/webhooks/paytech.js  →  ALIAS du handler IPN canonique
//
// [FIX] Ce chemin (/api/webhooks/paytech) était un doublon « orphelin » : il
// cherchait la commande par `orders.mobile_money_ref = token`, un champ que le
// flux commande PayTech ne renseigne JAMAIS (il passe order_id dans custom_field
// et stocke le token dans stripe_sessions). Résultat : si le dashboard PayTech
// pointait son URL IPN GLOBALE ici (au lieu de /api/payments/paytech/ipn envoyé
// par requête), tout paiement de commande retombait sur « Order not found » (404)
// → la commande restait pending_payment indéfiniment (« impossible de valider
// paiement »).
//
// Plutôt que de maintenir deux logiques divergentes, cet endpoint DÉLÈGUE
// désormais au handler IPN canonique (validation HMAC avec fallback
// PAYTECH_API_SECRET||PAYTECH_SECRET_KEY, idempotence, gestion order/boost/story/
// flash/b2b/transport via custom_field). Ainsi, quelle que soit celle des deux
// URL configurée côté PayTech, la validation fonctionne à l'identique.
// ============================================================

export { onRequest } from '../payments/paytech/ipn.js';
