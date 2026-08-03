// Tests de contrat des helpers de vérification des webhooks paiement.
// (#3 roadmap pro — sécurité des IPN : hash, comparaison constante, parsing.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha512hex, sha256hex, timingSafeEqual, parseNested } from '../../functions/api/_lib/webhook-utils.js';

// Vecteurs connus (NIST) → garantit que la vérif d'IPN PayDunya (SHA-512 de la
// master key) et PayTech (SHA-256) produit exactement les bons hex.
test('sha512hex : vecteurs connus', async () => {
  assert.equal(await sha512hex(''),
    'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e');
  assert.equal(await sha512hex('test'),
    'ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db27ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff');
});

test('sha256hex : vecteurs connus', async () => {
  assert.equal(await sha256hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await sha256hex('test'),
    '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
});

test('timingSafeEqual : égalité stricte, longueur, contenu, types', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('', ''), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);   // même longueur, contenu ≠
  assert.equal(timingSafeEqual('abc', 'abcd'), false);  // longueurs ≠
  assert.equal(timingSafeEqual(null, 'abc'), false);    // non-string
  assert.equal(timingSafeEqual(undefined, undefined), false);
});

test('parseNested : reconstruit le form-encoded imbriqué PayDunya (data[...][...])', () => {
  const p = new URLSearchParams('data[hash]=abc&data[status]=completed&data[custom_data][order_id]=123&data[custom_data][user_id]=u9&data[invoice][token]=tok');
  const o = parseNested(p);
  assert.equal(o.data.hash, 'abc');
  assert.equal(o.data.status, 'completed');
  assert.equal(o.data.custom_data.order_id, '123');
  assert.equal(o.data.custom_data.user_id, 'u9');
  assert.equal(o.data.invoice.token, 'tok');
});

test('parseNested : clés plates simples', () => {
  const o = parseNested(new URLSearchParams('a=1&b=2'));
  assert.equal(o.a, '1');
  assert.equal(o.b, '2');
});
