// Vérifie la syntaxe de chaque <script> du monolithe public/index.html (pas de build).
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('public/index.html', 'utf8');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, i = 0, errors = 0;
while ((m = re.exec(html))) {
  const attrs = m[1] || '';
  const code = m[2];
  if (!code.trim()) continue;
  const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/i);
  const type = typeMatch ? typeMatch[1].toLowerCase() : '';
  // On ne vérifie que le JS classique ; on ignore JSON-LD, importmap, etc.
  if (type && !/^(text\/javascript|application\/javascript|module)$/.test(type)) continue;
  i++;
  try { new vm.Script(code, { filename: 'script#' + i }); }
  catch (e) { errors++; console.error('Script #' + i + ' ERREUR: ' + e.message); }
}
console.log('Scripts analysés: ' + i + ' — erreurs: ' + errors);
process.exit(errors ? 1 : 0);
