// Tests unitaires des validateurs partagés.
// Exécuter : npm run test:unit   (node --test, aucun navigateur requis)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone,
  isValidPhone,
  isValidMessage,
  toE164,
} from '../../functions/api/_lib/validate.js';

test('normalizePhone retire les non-chiffres et gère null', () => {
  assert.equal(normalizePhone('+221 77 625 48 95'), '221776254895');
  assert.equal(normalizePhone(null), '');
  assert.equal(normalizePhone(undefined), '');
});

test('isValidPhone applique les bornes 8..15', () => {
  assert.equal(isValidPhone('776254895'), true); // 9 chiffres
  assert.equal(isValidPhone('221776254895'), true); // 12 chiffres
  assert.equal(isValidPhone('1234567'), false); // 7 chiffres
  assert.equal(isValidPhone('1'.repeat(16)), false); // 16 chiffres
  assert.equal(isValidPhone(''), false);
});

test('toE164 : normalise les formats sénégalais en E.164 sans +', () => {
  // Formats locaux / internationaux variés → 221XXXXXXXXX
  assert.equal(toE164('77 123 45 67'), '221771234567');   // local espacé
  assert.equal(toE164('+221 77 123 45 67'), '221771234567'); // international +
  assert.equal(toE164('00221771234567'), '221771234567');    // préfixe 00
  assert.equal(toE164('221771234567'), '221771234567');      // déjà E.164 sans +
  assert.equal(toE164('771234567'), '221771234567');         // 9 chiffres nus
});

test('toE164 : repli non destructif si non parsable (jamais plus strict)', () => {
  // Numéro non-SN valide reconnu par la lib → conservé en E.164.
  assert.equal(toE164('+33 6 12 34 56 78'), '33612345678');
  // Chaîne vide → chaîne vide (repli), pas d'exception.
  assert.equal(toE164(''), '');
  assert.equal(toE164(null), '');
});

test('isValidMessage : non vide, chaîne, ≤ max', () => {
  assert.equal(isValidMessage('bonjour'), true);
  assert.equal(isValidMessage(''), false);
  assert.equal(isValidMessage('x'.repeat(1001)), false);
  assert.equal(isValidMessage('x'.repeat(1001), 2000), true);
  assert.equal(isValidMessage(123), false);
  assert.equal(isValidMessage(null), false);
});
