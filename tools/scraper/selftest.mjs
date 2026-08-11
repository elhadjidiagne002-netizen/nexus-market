// tools/scraper/selftest.mjs
// Vérifie le plumbing (transformation → CSV) SANS scraper : données factices en entrée.
import { toRow, dedupe, normalizePhone, isMobile } from './lib/prospects-csv.mjs';

const assert = (c, m) => { if (!c) { console.error('❌ ' + m); process.exit(1); } else console.log('✅ ' + m); };

// Normalisation téléphone
assert(normalizePhone('+221 77 123 45 67') === '+221 77 123 45 67', 'tel mobile formaté conservé');
assert(normalizePhone('771234567') === '+221 77 123 45 67', 'tel 9 chiffres → +221');
assert(normalizePhone('00221331234567') === '+221 33 123 45 67', '00221 → +221 (fixe)');
assert(normalizePhone('+33 6 12 34 56 78') === '', 'numéro étranger ignoré');
assert(isMobile('+221 78 000 00 00') === true && isMobile('+221 33 000 00 00') === false, 'détection mobile (7X)');

// Mapping + région déduite
const r = toRow({ name: '  Plomberie Diallo ', address: 'Rue 12, Grand Yoff, Dakar', phone: '+221 77 555 66 77', lat: 14.75, lng: -17.45, source: 'test' });
assert(r.Nom === 'Plomberie Diallo' && r.Region === 'Dakar' && r.Latitude === '14.750000', 'toRow: nom trim, région Dakar, GPS');

// Dédup + priorité mobile
const rows = [
  toRow({ name: 'A', phone: '+221 33 111 11 11', source: 't' }),
  toRow({ name: 'B', phone: '+221 77 222 22 22', source: 't' }),
  toRow({ name: 'A', phone: '+221 33 111 11 11', source: 't' }), // doublon
];
const d = dedupe(rows);
assert(d.length === 2, 'dédup retire le doublon');
assert(isMobile(d[0].Telephone), 'tri : mobile en premier');
const m = dedupe(rows, { mobileOnly: true });
assert(m.length === 1 && m[0].Nom === 'B', 'mobileOnly ne garde que les 7X');

console.log('\n🎉 Self-test OK — le système est prêt (aucune prospection lancée).');
