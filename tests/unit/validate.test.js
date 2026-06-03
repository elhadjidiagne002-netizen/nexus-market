// Tests unitaires des validateurs partagés.
// Exécuter : npm run test:unit   (node --test, aucun navigateur requis)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone,
  isValidPhone,
  isValidMessage,
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

test('isValidMessage : non vide, chaîne, ≤ max', () => {
  assert.equal(isValidMessage('bonjour'), true);
  assert.equal(isValidMessage(''), false);
  assert.equal(isValidMessage('x'.repeat(1001)), false);
  assert.equal(isValidMessage('x'.repeat(1001), 2000), true);
  assert.equal(isValidMessage(123), false);
  assert.equal(isValidMessage(null), false);
});
