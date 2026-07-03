// Tests unitaires — bornes de montant de paiement (anti-sous-paiement).
// Couvre la logique critique extraite de validatePaymentAmount (functions/api/_lib/utils.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentAmountBounds } from '../../functions/api/_lib/utils.js';

test('montant exact → accepté', () => {
  assert.equal(paymentAmountBounds({ amountEur: 100, expectedEur: 100 }).ok, true);
});

test('sous-paiement en dessous du plancher (défaut 60% de remise) → refusé', () => {
  // plancher = 100 × (1 − 0.6) = 40
  const r = paymentAmountBounds({ amountEur: 39.99, expectedEur: 100 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'under');
  assert.equal(r.floor, 40);
});

test('paiement pile au plancher (40% avec 60% de remise) → accepté', () => {
  assert.equal(paymentAmountBounds({ amountEur: 40, expectedEur: 100 }).ok, true);
});

test('sur-paiement au-delà du plafond → refusé', () => {
  // plafond = 100 × 1.02 + 2 = 104
  const r = paymentAmountBounds({ amountEur: 104.01, expectedEur: 100 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'over');
  assert.equal(r.ceil, 104);
});

test('léger dépassement dans la tolérance de frais (≤ 2% + 2€) → accepté', () => {
  assert.equal(paymentAmountBounds({ amountEur: 103.5, expectedEur: 100 }).ok, true);
  assert.equal(paymentAmountBounds({ amountEur: 104, expectedEur: 100 }).ok, true);
});

test('petite commande : le buffer absolu de frais couvre les arrondis', () => {
  // expected 1€ → plafond = 1.02 + 2 = 3.02 (les frais fixes ~2€ ne cassent pas un petit paiement)
  assert.equal(paymentAmountBounds({ amountEur: 3, expectedEur: 1 }).ok, true);
});

test('maxDisc est borné à 0.95 (on ne peut pas payer ~0)', () => {
  // maxDisc=2 → clampé à 0.95 → plancher ≈ 5 (tolérance flottante)
  const r = paymentAmountBounds({ amountEur: 4, expectedEur: 100, maxDisc: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'under');
  assert.ok(Math.abs(r.floor - 5) < 1e-6, `floor attendu ~5, reçu ${r.floor}`);
  assert.equal(paymentAmountBounds({ amountEur: 6, expectedEur: 100, maxDisc: 2 }).ok, true);
});

test('maxDisc négatif ou NaN → traité comme 0 (paiement plein requis)', () => {
  assert.equal(paymentAmountBounds({ amountEur: 99.99, expectedEur: 100, maxDisc: -1 }).reason, 'under');
  assert.equal(paymentAmountBounds({ amountEur: 100, expectedEur: 100, maxDisc: NaN }).ok, true);
});

test('feeTolEur configurable', () => {
  // avec 0 de tolérance de frais : plafond = 102 exact
  assert.equal(paymentAmountBounds({ amountEur: 103, expectedEur: 100, feeTolEur: 0 }).reason, 'over');
  assert.equal(paymentAmountBounds({ amountEur: 102, expectedEur: 100, feeTolEur: 0 }).ok, true);
});
