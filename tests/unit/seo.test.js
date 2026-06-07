// Tests unitaires des helpers SEO (référencement + anti-contournement RT-01).
// Exécuter : npm run test:unit   (node --test, aucun navigateur requis)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactContact, renderListingPage, esc } from '../../functions/_lib/seo.js';
import { slugify, slugForLabel, categoryBySlug, googleCategory } from '../../functions/_lib/categories.js';

// ── redactContact (anti-contournement WhatsApp / RT-01) ──────────────────────
test('redactContact masque les numéros sénégalais (mobiles)', () => {
  for (const n of ['77 123 45 67', '771234567', '+221 77 123 45 67', '77.123.45.67', '33 821 00 00']) {
    const out = redactContact(`Contactez-moi au ${n} svp`);
    assert.ok(out.includes('[contact via NEXUS]'), `devrait masquer: ${n}`);
    assert.ok(!/\d{2}[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}/.test(out.replace('[contact via NEXUS]', '')), `numéro résiduel: ${n}`);
  }
});

test('redactContact masque les liens WhatsApp / Telegram', () => {
  assert.ok(redactContact('écris sur https://wa.me/221771234567').includes('[contact via NEXUS]'));
  assert.ok(redactContact('rejoins t.me/maboutique').includes('[contact via NEXUS]'));
  assert.ok(redactContact('whatsapp: 77 123 45 67').includes('[contact via NEXUS]'));
});

test('redactContact NE masque PAS les prix', () => {
  assert.equal(redactContact('Prix : 1 500 000 FCFA'), 'Prix : 1 500 000 FCFA');
  assert.equal(redactContact('Promo 185 000 FCFA'), 'Promo 185 000 FCFA');
  assert.equal(redactContact('177 000 000 FCFA'), '177 000 000 FCFA');
});

test('redactContact gère null/undefined', () => {
  assert.equal(redactContact(null), null);
  assert.equal(redactContact(undefined), undefined);
});

// ── slugify / catégories ─────────────────────────────────────────────────────
test('slugify retire accents et normalise', () => {
  assert.equal(slugify('Téléphones'), 'telephones');
  assert.equal(slugify('Mode & Vêtements'), 'mode-vetements');
  assert.equal(slugify('Saint-Louis'), 'saint-louis');
});

test('categoryBySlug et slugForLabel sont cohérents', () => {
  assert.equal(categoryBySlug('telephones').label, 'Téléphones');
  assert.equal(categoryBySlug('inconnu-xyz'), null);
  assert.equal(slugForLabel('Mode'), 'mode');           // alias → slug canonique
  assert.equal(slugForLabel('Vêtements'), 'mode');
  assert.equal(googleCategory('Téléphones'), 'Electronics > Communications > Telephony');
});

// ── renderListingPage (méta + JSON-LD + masquage) ────────────────────────────
test('renderListingPage produit une page valide avec JSON-LD', () => {
  const html = renderListingPage({
    origin: 'https://nexus-market-asb.pages.dev', kind: 'produit', id: 'abc-1',
    title: 'Samsung Galaxy A55', description: 'Bon état', image: 'https://x/i.jpg',
    priceFcfa: 185000, category: 'Téléphones', rating: 4.5, reviewsCount: 12, inStock: true,
  });
  assert.ok(html.includes('<title>'));
  assert.ok(html.includes('application/ld+json'));
  assert.ok(html.includes('AggregateRating'));
  assert.ok(html.includes('BreadcrumbList'));
  assert.ok(html.includes('/categorie/telephones'));
  assert.ok(html.includes('rel="canonical"'));
});

test('renderListingPage masque un numéro glissé dans la description', () => {
  const html = renderListingPage({
    origin: 'https://x', kind: 'annonce', id: 'a1',
    title: 'Canapé neuf', description: 'Très bon état, appelez le 77 123 45 67',
    priceFcfa: 50000, category: 'Maison & Déco',
  });
  assert.ok(!html.includes('77 123 45 67'), 'le numéro ne doit pas apparaître');
  assert.ok(html.includes('[contact via NEXUS]'));
});

// ── esc (échappement HTML) ───────────────────────────────────────────────────
test('esc échappe les caractères dangereux', () => {
  assert.equal(esc('<b>"&"</b>'), '&lt;b&gt;&quot;&amp;&quot;&lt;/b&gt;');
  assert.equal(esc(null), '');
});
