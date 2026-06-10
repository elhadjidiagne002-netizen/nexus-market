// Génère les icônes de l'app à partir de public/logo-source.png (logo complet
// « NEXUS MARKET »). Extrait automatiquement le SYMBOLE NX (bloc du haut, séparé
// du texte par la bande transparente), le détoure, et produit toutes les tailles.
import { Jimp } from 'jimp';

const SRC = 'public/logo-source.png';
const src = await Jimp.read(SRC);
const W = src.bitmap.width, H = src.bitmap.height, D = src.bitmap.data;
const alpha = (x, y) => D[(y * W + x) * 4 + 3];

// 1) Détection des blocs verticaux non transparents (NX en haut, texte en bas).
function rowCount(y) { let c = 0; for (let x = 0; x < W; x += 3) if (alpha(x, y) > 24) c++; return c; }
const blocks = []; let inB = false, start = 0;
const minRun = Math.round(H * 0.01);
for (let y = 0; y < H; y++) {
  const has = rowCount(y) > 4;
  if (has && !inB) { inB = true; start = y; }
  else if (!has && inB) { inB = false; if (y - start > minRun) blocks.push([start, y - 1]); }
}
if (inB) blocks.push([start, H - 1]);
if (!blocks.length) throw new Error('Aucun contenu détecté');

// Le NX = premier bloc (le plus haut).
const [y0, y1] = blocks[0];
// 2) Bornes horizontales serrées sur ce bloc.
let x0 = W, x1 = 0;
for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) if (alpha(x, y) > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
console.log(`Blocs: ${blocks.length} | NX bbox = x:${x0} y:${y0} ${bw}x${bh}`);

const nx = src.clone().crop({ x: x0, y: y0, w: bw, h: bh });

// 3) Génération.
async function make(path, size, scale, bg /* number RGBA ou null=transparent */) {
  const canvas = new Jimp({ width: size, height: size, color: bg == null ? 0x00000000 : bg });
  const logo = nx.clone().scaleToFit({ w: Math.round(size * scale), h: Math.round(size * scale) });
  const x = Math.round((size - logo.bitmap.width) / 2);
  const y = Math.round((size - logo.bitmap.height) / 2);
  canvas.composite(logo, x, y);
  await canvas.write(path);
  console.log('✓', path, `${size}px (logo ${logo.bitmap.width}x${logo.bitmap.height})`);
}

// any : logo bien rempli, transparent. maskable : marge de sécurité (~70%).
await make('public/icon-192.png', 192, 0.92, null);
await make('public/icon-512.png', 512, 0.92, null);
await make('public/icon-maskable-192.png', 192, 0.70, null);
await make('public/icon-maskable-512.png', 512, 0.70, null);
await make('public/favicon.png', 256, 0.94, null);
// apple-touch : iOS gère mal la transparence → fond blanc.
await make('public/apple-touch-icon.png', 180, 0.86, 0xffffffff);
console.log('Terminé.');
