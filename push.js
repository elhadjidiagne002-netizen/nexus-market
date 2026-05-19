// push.js — Script de push GitHub garanti
// Usage : node push.js
// Usage : node push.js "mon message de commit"
const { execSync, spawnSync } = require('child_process');

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';

const ok   = m => console.log(GREEN  + '✅ ' + m + RESET);
const fail = m => console.log(RED    + '❌ ' + m + RESET);
const warn = m => console.log(YELLOW + '⚠️  ' + m + RESET);
const info = m => console.log(CYAN   + 'ℹ️  ' + m + RESET);
const head = m => console.log('\n' + CYAN + '━━━ ' + m + ' ━━━' + RESET);

// ── Exécute une commande, retourne { out, err, code } ────────────────────────
function run(cmd) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  return {
    out:  (r.stdout || '').trim(),
    err:  (r.stderr || '').trim(),
    code: r.status ?? 1,
  };
}

// ── Exécute et affiche en temps réel (pour git pull/push) ────────────────────
function runLive(cmd) {
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit' });
  return r.status ?? 1;
}

// ── Message de commit ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let commitMsg = args.join(' ').trim();
if (!commitMsg) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  commitMsg = `Update ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// ══════════════════════════════════════════════════════════════════════════════

head('Vérification repo git');

if (run('git rev-parse --git-dir').code !== 0) {
  fail('Pas de repo git ici. Lance le script depuis la racine du projet.');
  process.exit(1);
}

const branch = run('git branch --show-current').out || 'main';
info(`Branche : ${branch}`);

// ── Étape 1 : Sauvegarder les changements locaux ──────────────────────────────
head('Sauvegarde des changements locaux');

const status = run('git status --porcelain').out;
const hasChanges = status.length > 0;

if (hasChanges) {
  console.log(status);
  info(`Commit : "${commitMsg}"`);

  // Stash d'abord pour pouvoir pull proprement
  run('git add -A');
  const stashResult = run(`git stash push -m "push-script-temp"`);
  if (stashResult.code !== 0) {
    warn('Stash impossible — tentative de commit direct');
  } else {
    ok('Changements mis de côté (stash)');
  }
} else {
  info('Aucun changement local — vérification des commits en attente');
}

// ── Étape 2 : Récupérer les commits distants ─────────────────────────────────
head('Récupération depuis GitHub');

const fetchCode = runLive(`git fetch origin ${branch}`);
if (fetchCode !== 0) {
  warn('Fetch échoué (réseau?) — tentative de push quand même');
} else {
  ok('Fetch réussi');
}

// ── Étape 3 : Appliquer les commits distants par rebase ───────────────────────
head('Intégration des commits distants');

const behind = run(`git rev-list --count HEAD..origin/${branch}`).out;
if (behind && parseInt(behind) > 0) {
  info(`${behind} commit(s) distants à intégrer...`);
  const rebaseCode = runLive(`git rebase origin/${branch}`);
  if (rebaseCode !== 0) {
    warn('Rebase en conflit — abandon du rebase et fusion directe');
    run('git rebase --abort');
    const mergeCode = runLive(`git merge origin/${branch} --no-edit`);
    if (mergeCode !== 0) {
      fail('Merge échoué. Résolvez les conflits manuellement puis relancez.');
      // Restaurer le stash avant de quitter
      if (hasChanges) run('git stash pop');
      process.exit(1);
    }
    ok('Merge réussi');
  } else {
    ok('Rebase réussi');
  }
} else {
  ok('Déjà à jour avec le remote');
}

// ── Étape 4 : Ré-appliquer les changements locaux ────────────────────────────
if (hasChanges) {
  head('Ré-application des changements locaux');
  const popResult = run('git stash pop');
  if (popResult.code !== 0) {
    warn('Stash pop en conflit — tentative de résolution automatique');
    run('git checkout --theirs .');
    run('git add -A');
  } else {
    ok('Changements restaurés');
  }

  // Commit
  head('Commit');
  run('git add -A');
  const commitResult = run(`git commit -m "${commitMsg.replace(/"/g, "'")}"`);
  if (commitResult.code !== 0) {
    const noChange = commitResult.out.includes('nothing to commit') || commitResult.err.includes('nothing to commit');
    if (noChange) {
      info('Rien à committer — déjà propre');
    } else {
      fail('Commit échoué : ' + (commitResult.err || commitResult.out));
      process.exit(1);
    }
  } else {
    ok(`Commit : ${commitResult.out.split('\n')[0]}`);
  }
}

// ── Étape 5 : Push ────────────────────────────────────────────────────────────
head('Push vers GitHub');

let pushCode = runLive(`git push origin ${branch}`);

// Si rejeté → réessayer avec force-with-lease (sûr)
if (pushCode !== 0) {
  warn('Push rejeté — tentative avec --force-with-lease (sécurisé)');
  pushCode = runLive(`git push origin ${branch} --force-with-lease`);
}

// ── Résultat final ────────────────────────────────────────────────────────────
console.log('');
if (pushCode === 0) {
  ok('Push réussi ! Cloudflare Pages va redéployer automatiquement 🚀');
} else {
  fail('Push échoué. Causes possibles :');
  console.log('  • Token GitHub expiré → https://github.com/settings/tokens');
  console.log('  • Pas de connexion internet');
  console.log('  • Branche protégée sur GitHub');
  process.exit(1);
}
