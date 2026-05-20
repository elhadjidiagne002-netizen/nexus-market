#!/usr/bin/env node

/**
 * git-push-secure.js — Script d'automatisation et de synchronisation Git sécurisé
 * * Avantages de cette version :
 * 1. Supporte les flags standards : -m "votre message" ou --message "votre message"
 * 2. Détection automatique du Remote (origin, upstream, etc.) au lieu d'une valeur codée en dur.
 * 3. Inclut les nouveaux fichiers (untracked) dans le processus de Stash temporaire.
 * 4. Totalement impersonnel : utilisable sur n'importe quel projet (Web, Mobile, DevOps, etc.).
 */

const { spawnSync } = require('child_process');

// ── Configuration des couleurs de sortie ─────────────────────────────────────
const COLORS = {
  GREEN:  '\x1b[32m',
  RED:    '\x1b[31m',
  YELLOW: '\x1b[33m',
  CYAN:   '\x1b[36m',
  RESET:  '\x1b[0m'
};

const log = {
  ok:   msg => console.log(`${COLORS.GREEN}✅ ${msg}${COLORS.RESET}`),
  fail: msg => console.log(`${COLORS.RED}❌ ${msg}${COLORS.RESET}`),
  warn: msg => console.log(`${COLORS.YELLOW}⚠️  ${msg}${COLORS.RESET}`),
  info: msg => console.log(`${COLORS.CYAN}ℹ️  ${msg}${COLORS.RESET}`),
  head: title => console.log(`\n${COLORS.CYAN}━━━ ${title.toUpperCase()} ━━━${COLORS.RESET}`)
};

// ── Exécuteurs de commandes ──────────────────────────────────────────────────
function execute(cmd, args = []) {
  const r = spawnSync(cmd, args, { shell: true, encoding: 'utf8' });
  return {
    out:  (r.stdout || '').trim(),
    err:  (r.stderr || '').trim(),
    code: r.status ?? 1,
  };
}

function executeLive(cmd, args = []) {
  const r = spawnSync(cmd, args, { shell: true, stdio: 'inherit' });
  return r.status ?? 1;
}

// ── Gestionnaire d'arguments avancé ──────────────────────────────────────────
function parseArguments() {
  const args = process.argv.slice(2);
  let message = '';
  
  // Cherche l'argument après -m ou --message
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-m' || args[i] === '--message') {
      if (args[i + 1]) {
        message = args[i + 1].trim();
        break;
      }
    }
  }

  // Si aucun flag trouvé, on prend l'ensemble des arguments bruts (compatibilité)
  if (!message && args.length > 0 && !args[0].startsWith('-')) {
    message = args.join(' ').trim();
  }

  // Message par défaut horodaté si vide
  if (!message) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    message = `Auto-commit: ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  return message;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Début du processus
// ══════════════════════════════════════════════════════════════════════════════

const commitMsg = parseArguments();

log.head('Vérification de l\'environnement Git');

// 1. Vérifier si Git est disponible et s'il s'agit d'un repo
if (execute('git rev-parse --git-dir').code !== 0) {
  log.fail('Aucun dépôt Git détecté. Veuillez exécuter ce script à la racine de votre projet.');
  process.exit(1);
}

// 2. Détection automatique de la branche courante
const branch = execute('git branch --show-current').out || 'main';

// 3. Détection automatique du Remote lié (fallback sur 'origin' si aucun)
let remote = execute(`git config --get branch.${branch}.remote`).out;
if (!remote) {
  const remotesList = execute('git remote').out.split('\n').filter(Boolean);
  remote = remotesList.includes('origin') ? 'origin' : (remotesList[0] || 'origin');
}

log.info(`Branche active : ${branch}`);
log.info(`Dépôt distant  : ${remote}`);

// ── Étape 1 : Sauvegarde sécurisée des modifications locales ─────────────────
log.head('Analyse des modifications locales');

// --porcelain permet de voir tous les changements y compris les fichiers non-suivis (? ?)
const status = execute('git status --porcelain').out;
const hasChanges = status.length > 0;

if (hasChanges) {
  console.log(status);
  log.info(`Futur commit : "${commitMsg}"`);

  // Indexation globale indispensable pour le stash
  execute('git add -A');
  
  // Utilisation de --include-untracked pour ne perdre aucun nouveau fichier créé pendant le pull
  const stashResult = execute('git stash push --include-untracked -m "git-push-secure-temp"');
  if (stashResult.code !== 0) {
    log.warn('Mise de côté (stash) impossible — Tentative de commit direct');
  } else {
    log.ok('Modifications locales mises en sécurité temporairement (Stash)');
  }
} else {
  log.info('Aucune modification locale détectée — Vérification des mises à jour distantes');
}

// ── Étape 2 : Récupération des données distantes ─────────────────────────────
log.head('Synchronisation avec le serveur distant');

const fetchCode = executeLive(`git fetch ${remote} ${branch}`);
if (fetchCode !== 0) {
  log.warn('Échec de la récupération (Fetch). Le serveur est peut-être inaccessible ou nécessite une ré-authentification.');
  log.warn('Tentative de poursuite de la procédure...');
} else {
  log.ok('Données distantes récupérées avec succès');
}

// ── Étape 3 : Intégration des commits distants ───────────────────────────────
log.head('Intégration des commits distants');

const behindCount = execute(`git rev-list --count HEAD..${remote}/${branch}`).out;
if (behindCount && parseInt(behindCount) > 0) {
  log.info(`Votre branche a ${behindCount} commit(s) de retard. Application des modifications...`);
  
  // Tentative de Rebase pour garder un historique propre et linéaire
  const rebaseCode = executeLive(`git rebase ${remote}/${branch}`);
  if (rebaseCode !== 0) {
    log.warn('Conflit détecté lors du rebase — Annulation et bascule vers une fusion (Merge) directe');
    execute('git rebase --abort');
    
    const mergeCode = executeLive(`git merge ${remote}/${branch} --no-edit`);
    if (mergeCode !== 0) {
      log.fail('Fusion échouée en raison de conflits complexes.');
      log.info('Résolution : Veuillez résoudre les conflits manuellement, puis relancez le script.');
      if (hasChanges) execute('git stash pop'); // Restitution du travail en cours
      process.exit(1);
    }
    log.ok('Fusion (Merge) effectuée avec succès');
  } else {
    log.ok('Rebase appliqué avec succès');
  }
} else {
  log.ok('Votre branche locale est déjà à jour avec le serveur distant');
}

// ── Étape 4 : Restitution et validation du travail local ─────────────────────
if (hasChanges) {
  log.head('Restauration de vos modifications');
  
  const popResult = execute('git stash pop');
  if (popResult.code !== 0) {
    log.warn('Conflit détecté lors de la ré-application de vos modifications.');
    log.info('Résolution automatique : Priorisation de vos fichiers locaux...');
    execute('git checkout --theirs .');
    execute('git add -A');
  } else {
    log.ok('Modifications locales restaurées avec succès');
  }

  log.head('Validation du Commit');
  execute('git add -A');
  
  // Échappement propre des guillemets dans le message de commit
  const commitResult = execute(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
  if (commitResult.code !== 0) {
    const isClean = commitResult.out.includes('nothing to commit') || commitResult.err.includes('nothing to commit');
    if (isClean) {
      log.info('Rien à valider (Arbre de travail déjà propre)');
    } else {
      log.fail(`Échec du commit : ${commitResult.err || commitResult.out}`);
      process.exit(1);
    }
  } else {
    log.ok(`Commit validé : ${commitResult.out.split('\n')[0]}`);
  }
}

// ── Étape 5 : Publication (Push) ─────────────────────────────────────────────
log.head('Publication vers le serveur distant');

let pushCode = executeLive(`git push ${remote} ${branch}`);

// Si le push standard échoue, tentative sécurisée avec --force-with-lease
if (pushCode !== 0) {
  log.warn('Publication standard rejetée. Tentative sécurisée via --force-with-lease...');
  pushCode = executeLive(`git push ${remote} ${branch} --force-with-lease`);
}

// ── Résultat final ────────────────────────────────────────────────────────────
console.log('');
if (pushCode === 0) {
  log.ok('Processus terminé avec succès ! Les modifications sont en ligne. 🚀');
} else {
  log.fail('La publication a échoué.');
  console.log('  Vérifications recommandées :');
  console.log('  • Vos droits d\'accès (Token d\'accès ou clé SSH expirée/invalide)');
  console.log('  • Votre connexion au réseau internet');
  console.log('  • Les règles de protection de branche configurées sur votre serveur distant');
  process.exit(1);
}