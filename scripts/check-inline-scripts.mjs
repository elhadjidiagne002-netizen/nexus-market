// Vérifie la syntaxe de TOUS les <script> inline de public/index.html
// (vm.Script compile sans exécuter). Usage : node scripts/check-inline-scripts.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
let m, i = 0, errors = 0;
while ((m = re.exec(html)) !== null) {
  i++;
  const attrs = m[1] || '';
  const code = m[2];
  if (!code.trim()) continue;
  if (/type\s*=\s*["'](application\/(ld\+)?json|text\/babel)/i.test(attrs)) continue; // JSON-LD / JSX
  const line = html.slice(0, m.index).split('\n').length;
  try {
    new vm.Script(code, { filename: `inline-${i}@L${line}` });
  } catch (e) {
    errors++;
    console.error(`✗ <script> #${i} (ligne ${line}) : ${e.message}`);
  }
}
console.log(errors === 0 ? `✓ ${i} blocs <script> inline — aucune erreur de syntaxe` : `${errors} erreur(s)`);
process.exit(errors ? 1 : 0);
