#!/usr/bin/env node
/**
 * switch-domain.mjs — Bascule le domaine public de NEXUS Market en UNE commande.
 *
 * Remplace toutes les valeurs STATIQUES du domaine (celles que la constante
 * dynamique NEXUS_CONFIG.siteUrl ne peut pas couvrir) dans :
 *   · public/index.html   (og:url, og:image, twitter, canonical, hreflang,
 *                           données structurées, domaine Plausible, fallbacks JS)
 *   · public/robots.txt   (les 4 URLs de sitemaps)
 *   · wrangler.toml        (SITE_URL / FRONTEND_URL / BASE_URL / CONFIRM_EMAIL_URL /
 *                           CORS_ORIGIN + URLs de cron en commentaire)
 *
 * ⚠️  Ne touche PAS aux adresses e-mail @nexus.sn ni au nom de marque/légal.
 *
 * Usage :
 *   node scripts/switch-domain.mjs nexus.sn
 *   node scripts/switch-domain.mjs https://nexus.sn
 *   node scripts/switch-domain.mjs nexus.sn --from nexus-market-asb.pages.dev
 *   node scripts/switch-domain.mjs nexus.sn --dry        (aperçu sans écrire)
 *
 * Rejouable / idempotent. Après exécution : commit + push + redeploy, puis
 * déclarer le nouveau domaine dans AdSense, Search Console et Plausible.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function norm(d) {
  return String(d || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
let fromRaw = 'nexus-market-asb.pages.dev';
const positionals = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry') continue;
  if (a === '--from') { fromRaw = args[++i] || fromRaw; continue; }
  positionals.push(a);
}
const FROM = norm(fromRaw);
const TO = norm(positionals[0]);

if (!TO || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(TO)) {
  console.error('❌ Domaine cible invalide.\n   Ex : node scripts/switch-domain.mjs nexus.sn');
  process.exit(1);
}
if (TO === FROM) { console.error(`❌ Le domaine cible (${TO}) est identique à la source.`); process.exit(1); }

const FILES = ['public/index.html', 'public/robots.txt', 'wrangler.toml'];
let total = 0;

console.log(`🌐 Bascule de domaine : ${FROM}  →  ${TO}${dry ? '   (DRY-RUN)' : ''}\n`);

for (const rel of FILES) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) { console.log(`   ⚠️  ${rel} introuvable — ignoré`); continue; }
  const src = readFileSync(abs, 'utf8');
  const count = (src.match(new RegExp(FROM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (count === 0) { console.log(`   ·  ${rel} : 0 occurrence`); continue; }
  const out = src.split(FROM).join(TO);
  if (!dry) writeFileSync(abs, out);
  total += count;
  console.log(`   ✅ ${rel} : ${count} remplacement(s)${dry ? ' (non écrit)' : ''}`);
}

console.log(`\n${dry ? 'Aperçu' : 'Terminé'} — ${total} remplacement(s) au total.`);
console.log('\nÉtapes suivantes :');
console.log('  1. Vérifier le diff (git diff).');
console.log('  2. Cloudflare Pages → Custom domains → ajouter le domaine.');
console.log('  3. commit + push (redeploy auto).');
console.log(`  4. Déclarer ${TO} dans AdSense, Search Console et Plausible.`);
