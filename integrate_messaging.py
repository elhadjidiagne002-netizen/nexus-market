#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NEXUS Market — Script d'intégration automatique MessagingCenter v4.0.0
=======================================================================
Auteur  : NEXUS DevOps
Version : 1.0.0
Usage   : python integrate_messaging.py [--dry-run] [--no-backup]

Opérations effectuées :
  1. Sauvegarde horodatée de index.html et server.js
  2. Injection du module messaging-frontend.js dans index.html
     → Juste avant </body> (après le dernier </script>)
  3. Remplacement des 4 anciennes routes /api/messages dans server.js
     → Par le contenu complet de messaging-backend-routes.js
  4. Injection du MessagingBadge dans le GlobalHeader (nav)
  5. Injection de l'état showMessaging dans l'App principale
  6. Validation syntaxique post-patch
  7. Rapport coloré avec diff résumé

Prérequis :
  - Python 3.8+
  - Fichiers dans le même dossier : index.html, server.js,
    messaging-frontend.js, messaging-backend-routes.js

Options :
  --dry-run     Affiche ce qui serait fait sans modifier les fichiers
  --no-backup   Ne pas créer de sauvegardes (déconseillé)
  --force       Ignorer les avertissements et continuer
"""

import sys
import os
import re
import shutil
import argparse
import hashlib
import textwrap
from datetime import datetime
from pathlib import Path
from typing import Optional

# ── Terminal colors ───────────────────────────────────────────────────────────
class C:
    RESET  = '\033[0m'
    BOLD   = '\033[1m'
    RED    = '\033[91m'
    GREEN  = '\033[92m'
    YELLOW = '\033[93m'
    BLUE   = '\033[94m'
    CYAN   = '\033[96m'
    GRAY   = '\033[90m'
    WHITE  = '\033[97m'

def ok(msg):    print(f"  {C.GREEN}✓{C.RESET} {msg}")
def err(msg):   print(f"  {C.RED}✗ ERREUR : {msg}{C.RESET}")
def warn(msg):  print(f"  {C.YELLOW}⚠ {msg}{C.RESET}")
def info(msg):  print(f"  {C.CYAN}→{C.RESET} {msg}")
def step(n, msg): print(f"\n{C.BOLD}{C.BLUE}[{n}]{C.RESET} {C.BOLD}{msg}{C.RESET}")
def sep():      print(f"\n{C.GRAY}{'─' * 60}{C.RESET}")

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent

FILES = {
    'index':    SCRIPT_DIR / 'index.html',
    'server':   SCRIPT_DIR / 'server.js',
    'frontend': SCRIPT_DIR / 'messaging-frontend.js',
    'backend':  SCRIPT_DIR / 'messaging-backend-routes.js',
}

BACKUP_DIR = SCRIPT_DIR / 'nexus_backup'

# ── Marqueurs d'ancrage dans les fichiers cibles ──────────────────────────────

# ---- server.js ---------------------------------------------------------------
# Bloc à REMPLACER : du commentaire "── MESSAGES" jusqu'à "── NOTIFICATIONS"
SERVER_MESSAGES_START = "// ─── MESSAGES ────────────────────────────────────────────────────────────────"
SERVER_MESSAGES_END   = "// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────"

# ---- index.html ---------------------------------------------------------------
# Ancrage pour l'injection du script frontend : juste avant </body>
HTML_INJECT_BEFORE = "</script>\n</body>"

# Ancrage pour le MessagingBadge dans GlobalHeader
# On cherche la NotificationBell puis on insère le badge après
NOTIFICATION_BELL_ANCHOR = "/* @__PURE__ */ React.createElement(NotificationBell, { currentUser: currentUser2 })"
MESSAGING_BADGE_JSX = (
    ", /* @__PURE__ */ React.createElement(MessagingBadge, { "
    "currentUser: currentUser2, "
    "onClick: () => window.__nexusOpenMessaging && window.__nexusOpenMessaging() })"
)

# Marqueur de guard pour éviter les doubles injections
GUARD_COMMENT_HTML   = "// [NEXUS-MSG-v4] MessagingCenter intégré"
GUARD_COMMENT_SERVER = "// [NEXUS-MSG-v4] Routes messages v4.0.0"

# ── Helpers ───────────────────────────────────────────────────────────────────
def read(path: Path) -> str:
    """Lit un fichier en UTF-8 avec gestion BOM."""
    return path.read_text(encoding='utf-8-sig')

def write(path: Path, content: str, dry_run: bool = False) -> None:
    """Écrit un fichier en UTF-8."""
    if dry_run:
        info(f"[DRY-RUN] Écriture simulée → {path.name} ({len(content):,} chars)")
        return
    path.write_text(content, encoding='utf-8')

def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:12]

def line_count(text: str) -> int:
    return text.count('\n') + 1

def backup(path: Path, backup_dir: Path, dry_run: bool) -> Optional[Path]:
    """Crée une copie horodatée du fichier dans backup_dir."""
    if dry_run:
        info(f"[DRY-RUN] Backup simulé de {path.name}")
        return None
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts  = datetime.now().strftime('%Y%m%d_%H%M%S')
    dst = backup_dir / f"{path.stem}_{ts}{path.suffix}"
    shutil.copy2(path, dst)
    return dst

def find_line(text: str, fragment: str) -> Optional[int]:
    """Retourne le numéro de ligne (1-indexé) où fragment apparaît."""
    for i, line in enumerate(text.splitlines(), 1):
        if fragment in line:
            return i
    return None

def count_occurrences(text: str, fragment: str) -> int:
    return text.count(fragment)

# ── VALIDATIONS PRÉ-PATCH ─────────────────────────────────────────────────────
def validate_inputs(files: dict, args) -> bool:
    """Vérifie que tous les fichiers source et cible existent."""
    all_ok = True
    for name, path in files.items():
        if not path.exists():
            err(f"Fichier introuvable : {path}")
            all_ok = False
        else:
            size = path.stat().st_size
            info(f"{path.name:<35} {size:>10,} octets")
    return all_ok

def check_already_patched(html: str, js: str) -> tuple[bool, bool]:
    """Détecte si les patchs ont déjà été appliqués."""
    html_patched   = GUARD_COMMENT_HTML   in html
    server_patched = GUARD_COMMENT_SERVER in js
    return html_patched, server_patched

# ── PATCH 1 : server.js — Remplacer les routes messages ──────────────────────
def patch_server(server_content: str, backend_content: str) -> tuple[str, dict]:
    """
    Remplace le bloc :
      // ─── MESSAGES ──...
      app.get/post/patch... (4 routes)
    Par :
      // ─── MESSAGES ──...
      [contenu de messaging-backend-routes.js]
    """
    report = {}

    # Vérifier que les ancres existent
    if SERVER_MESSAGES_START not in server_content:
        raise ValueError(
            f"Ancre de début introuvable dans server.js :\n  '{SERVER_MESSAGES_START}'"
        )
    if SERVER_MESSAGES_END not in server_content:
        raise ValueError(
            f"Ancre de fin introuvable dans server.js :\n  '{SERVER_MESSAGES_END}'"
        )

    # Trouver les positions exactes
    start_idx = server_content.index(SERVER_MESSAGES_START)
    end_idx   = server_content.index(SERVER_MESSAGES_END)

    if end_idx <= start_idx:
        raise ValueError("L'ancre de fin est avant l'ancre de début dans server.js")

    # Extraire le bloc supprimé pour le rapport
    old_block = server_content[start_idx:end_idx]
    old_lines = line_count(old_block)

    # Nettoyer le contenu du backend (retirer les commentaires de SQL migration
    # qui sont déjà dans MESSAGING_INTEGRATION.md pour éviter la duplication
    # dans server.js — on les garde quand même pour référence)
    guard = f"\n{GUARD_COMMENT_SERVER}\n"
    new_block = (
        SERVER_MESSAGES_START + "\n"
        + guard
        + backend_content.strip()
        + "\n\n"
    )

    new_content = (
        server_content[:start_idx]
        + new_block
        + server_content[end_idx:]
    )

    report['old_routes_lines'] = old_lines
    report['new_routes_lines'] = line_count(new_block)
    report['old_sha']          = sha256(old_block)
    report['anchor_line']      = find_line(server_content, SERVER_MESSAGES_START)

    # Vérifier que les 8 nouvelles routes sont présentes
    expected_routes = [
        "'/api/messages/conversations'",
        "'/api/messages'",
        "'/api/messages/unread-count'",
        "'/api/messages/read'",
        "'/api/messages/:id/react'",
        "'/api/messages/:id/delete'",
        "'/api/messages/typing'",
        "'/api/messages/typing/:convId'",
        "'/api/messages/search'",
    ]
    missing = [r for r in expected_routes if r not in new_content]
    if missing:
        raise ValueError(f"Routes manquantes après patch : {missing}")

    report['routes_found'] = len(expected_routes) - len(missing)
    return new_content, report

# ── PATCH 2 : index.html — Injection du script frontend ──────────────────────
def patch_html_script(html: str, frontend_content: str) -> tuple[str, dict]:
    """
    Insère le module messaging-frontend.js comme <script> inline
    juste avant </body>, après le dernier </script> existant.
    """
    report = {}

    # Point d'injection : juste avant le dernier </body>
    if '</body>' not in html:
        raise ValueError("Tag </body> introuvable dans index.html")

    inject_marker = '</body>'
    inject_pos = html.rfind(inject_marker)

    script_block = (
        f"\n<!-- MessagingCenter v4.0.0 — Injection automatique par integrate_messaging.py -->\n"
        f"<script>\n"
        f"{GUARD_COMMENT_HTML}\n"
        f"// Injecté le {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"{frontend_content.strip()}\n"
        f"</script>\n"
    )

    new_html = (
        html[:inject_pos]
        + script_block
        + html[inject_pos:]
    )

    report['inject_line']      = html[:inject_pos].count('\n') + 1
    report['script_chars']     = len(frontend_content)
    report['script_lines']     = line_count(frontend_content)
    report['new_html_lines']   = line_count(new_html)

    return new_html, report

# ── PATCH 3 : index.html — Injection du MessagingBadge dans GlobalHeader ──────
def patch_html_badge(html: str) -> tuple[str, dict]:
    """
    Ajoute le MessagingBadge juste après la NotificationBell dans le GlobalHeader.
    Cette modification est OPTIONNELLE : si l'ancre est introuvable, on passe.
    """
    report = {'badge_injected': False}

    if NOTIFICATION_BELL_ANCHOR not in html:
        warn("NotificationBell non trouvée — badge messaging non injecté dans le header")
        warn("Vous pourrez l'ajouter manuellement (voir MESSAGING_INTEGRATION.md)")
        return html, report

    # Vérifier que le badge n'est pas déjà injecté dans le header
    # (on cherche spécifiquement l'élément JSX dans le header, pas la définition du composant)
    if MESSAGING_BADGE_JSX in html or 'MessagingBadge, { currentUser: currentUser2' in html:
        info("MessagingBadge déjà présent dans le header — saut de cette étape")
        report['badge_injected'] = 'already_present'
        return html, report

    # Injection : on ajoute le badge directement après NotificationBell
    insert_after = NOTIFICATION_BELL_ANCHOR
    pos = html.index(insert_after) + len(insert_after)

    new_html = html[:pos] + MESSAGING_BADGE_JSX + html[pos:]

    report['badge_injected'] = True
    report['badge_line']     = html[:pos].count('\n') + 1

    return new_html, report

# ── PATCH 4 : index.html — Exposition de l'ouverture globale ──────────────────
def patch_html_global_opener(html: str) -> tuple[str, dict]:
    """
    Ajoute une mini-fonction globale window.__nexusOpenMessaging
    dans le bloc script qui suit l'init React, pour que le badge
    du header puisse ouvrir le MessagingCenter sans accès direct
    au state React (le state est encapsulé dans le composant App).

    Stratégie : ajouter dans le dernier <script> inline (juste avant </script></body>)
    un listener CustomEvent que le badge dispatch.
    """
    report = {}

    opener_snippet = """
// ── MessagingCenter — Opener global (injecté par integrate_messaging.py) ────
// Permet au MessagingBadge header d'ouvrir le MessagingCenter
// depuis n'importe où dans l'app sans prop drilling.
window.__nexusOpenMessaging = function() {
  document.dispatchEvent(new CustomEvent('nexus:open-messaging'));
};
// Le composant App écoute cet événement :
//   useEffect(() => {
//     const h = () => setShowMessaging(true);
//     document.addEventListener('nexus:open-messaging', h);
//     return () => document.removeEventListener('nexus:open-messaging', h);
//   }, []);
"""
    guard = "window.__nexusOpenMessaging"

    if guard in html:
        info("Opener global déjà présent — saut de cette étape")
        report['opener_injected'] = False
        return html, report

    # Insérer dans le bloc du dernier </script> (avant </body>)
    # On cherche le dernier </script> avant </body>
    body_pos  = html.rfind('</body>')
    # Trouver le dernier </script> avant </body>
    chunk     = html[:body_pos]
    last_end  = chunk.rfind('</script>')

    if last_end == -1:
        warn("Impossible d'injecter l'opener global — aucun </script> trouvé avant </body>")
        report['opener_injected'] = False
        return html, report

    new_html = html[:last_end] + opener_snippet + "\n" + html[last_end:]
    report['opener_injected'] = True
    report['opener_line']     = html[:last_end].count('\n') + 1

    return new_html, report

# ── VALIDATION POST-PATCH ─────────────────────────────────────────────────────
def validate_html_output(html: str) -> list[str]:
    """
    Validations basiques de l'HTML produit.
    Retourne une liste d'avertissements (vide = tout OK).
    """
    warnings = []

    # Comptage des balises <script> et </script>
    # Note : on accepte un écart de 1 car certains fichiers minifiés ont
    # des <script> sans type="text/javascript" qui ne sont pas fermés séparément
    open_count  = len(re.findall(r'<script[\s>]', html))
    close_count = html.count('</script>')
    if abs(open_count - close_count) > 1:
        warnings.append(f"Possible déséquilibre balises script : {open_count} ouvertures / {close_count} fermetures")

    # Vérifier que les composants clés sont présents
    required_tokens = [
        'MessagingCenter',
        'NexusPollingService',
        'MessagingBadge',
        GUARD_COMMENT_HTML,
    ]
    for tok in required_tokens:
        if tok not in html:
            warnings.append(f"Token manquant dans index.html : '{tok}'")

    # Vérifier la présence du shim de rétrocompatibilité
    if 'window.MessageComposeModal' not in html:
        warnings.append("Shim window.MessageComposeModal non trouvé")

    return warnings

def validate_server_output(server: str) -> list[str]:
    warnings = []

    required_routes = [
        "'/api/messages/conversations'",
        "'/api/messages/typing/:convId'",
        "'/api/messages/:id/react'",
        "'/api/messages/:id/delete'",
        GUARD_COMMENT_SERVER,
    ]
    for tok in required_routes:
        if tok not in server:
            warnings.append(f"Token manquant dans server.js : '{tok}'")

    # Vérifier que le typing store in-memory est présent
    if '_typingStore' not in server:
        warnings.append("Store de frappe (_typingStore) non trouvé dans server.js")

    return warnings

# ── RAPPORT FINAL ─────────────────────────────────────────────────────────────
def print_report(reports: dict, start_time: datetime) -> None:
    elapsed = (datetime.now() - start_time).total_seconds()
    sep()
    print(f"\n{C.BOLD}{C.GREEN}✓ INTÉGRATION TERMINÉE{C.RESET}  ({elapsed:.1f}s)\n")

    srv = reports.get('server', {})
    if srv:
        print(f"  {C.BOLD}server.js{C.RESET}")
        print(f"    Ancrage trouvé   : ligne {srv.get('anchor_line', '?')}")
        print(f"    Routes supprimées: {srv.get('old_routes_lines', '?')} lignes (SHA {srv.get('old_sha', '?')})")
        print(f"    Routes injectées : {srv.get('new_routes_lines', '?')} lignes")
        print(f"    Routes présentes : {srv.get('routes_found', '?')}/9")

    html = reports.get('html_script', {})
    if html:
        print(f"\n  {C.BOLD}index.html — script module{C.RESET}")
        print(f"    Injection à      : ligne {html.get('inject_line', '?')}")
        print(f"    Script injecté   : {html.get('script_lines', '?')} lignes / {html.get('script_chars', '?'):,} chars")
        print(f"    HTML final       : {html.get('new_html_lines', '?'):,} lignes")

    badge = reports.get('html_badge', {})
    if badge:
        status = badge.get('badge_injected', False)
        label  = '✓ Injecté' if status is True else ('Déjà présent' if status == 'already_present' else '⚠ Sauté')
        print(f"\n  {C.BOLD}index.html — MessagingBadge header{C.RESET}")
        print(f"    Statut           : {label}")
        if badge.get('badge_line'):
            print(f"    Position         : ligne {badge.get('badge_line')}")

    opener = reports.get('html_opener', {})
    if opener:
        print(f"\n  {C.BOLD}index.html — Opener global{C.RESET}")
        print(f"    Injecté          : {'✓' if opener.get('opener_injected') else '⚠ Sauté'}")

    bkp = reports.get('backups', {})
    if bkp:
        print(f"\n  {C.BOLD}Sauvegardes{C.RESET}")
        for name, path in bkp.items():
            print(f"    {name:<12} → {path}")

    sep()
    print(f"\n  {C.BOLD}Étapes suivantes :{C.RESET}")
    print(f"  {C.CYAN}1.{C.RESET} Exécuter la migration SQL Supabase (voir MESSAGING_INTEGRATION.md)")
    print(f"  {C.CYAN}2.{C.RESET} Tester en local : node server.js")
    print(f"  {C.CYAN}3.{C.RESET} Ouvrir index.html et vérifier l'affichage du MessagingBadge dans le header")
    print(f"  {C.CYAN}4.{C.RESET} Déployer sur Railway/Vercel\n")

# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='Intègre MessagingCenter v4 dans NEXUS Market',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
          Exemples :
            python integrate_messaging.py
            python integrate_messaging.py --dry-run
            python integrate_messaging.py --no-backup --force
        """)
    )
    parser.add_argument('--dry-run',   action='store_true', help="Simulation sans écriture")
    parser.add_argument('--no-backup', action='store_true', help="Ne pas créer de sauvegardes")
    parser.add_argument('--force',     action='store_true', help="Continuer malgré les avertissements")
    args = parser.parse_args()

    start_time = datetime.now()
    reports    = {}

    # ── En-tête ───────────────────────────────────────────────────────────────
    print(f"\n{C.BOLD}{C.CYAN}{'═' * 60}")
    print(f"  NEXUS Market — Intégration MessagingCenter v4.0.0")
    print(f"{'═' * 60}{C.RESET}")
    if args.dry_run:
        print(f"\n  {C.YELLOW}{C.BOLD}MODE DRY-RUN — aucun fichier ne sera modifié{C.RESET}\n")

    # ── Étape 0 : Vérification des fichiers ───────────────────────────────────
    step(0, "Vérification des fichiers sources")
    if not validate_inputs(FILES, args):
        err("Fichiers manquants. Placez tous les fichiers dans le même dossier que ce script.")
        sys.exit(1)
    ok("Tous les fichiers sont présents")

    # ── Chargement ────────────────────────────────────────────────────────────
    step('L', "Chargement des fichiers")
    try:
        html_orig     = read(FILES['index'])
        server_orig   = read(FILES['server'])
        frontend_code = read(FILES['frontend'])
        backend_code  = read(FILES['backend'])
    except Exception as e:
        err(f"Erreur de lecture : {e}")
        sys.exit(1)

    info(f"index.html       : {line_count(html_orig):>7,} lignes")
    info(f"server.js        : {line_count(server_orig):>7,} lignes")
    info(f"messaging-frontend.js  : {line_count(frontend_code):>7,} lignes")
    info(f"messaging-backend-routes.js : {line_count(backend_code):>7,} lignes")
    ok("Chargement OK")

    # ── Vérification : déjà patché ? ──────────────────────────────────────────
    html_patched, server_patched = check_already_patched(html_orig, server_orig)
    if html_patched or server_patched:
        if html_patched:
            warn(f"index.html semble déjà patché ({GUARD_COMMENT_HTML!r} trouvé)")
        if server_patched:
            warn(f"server.js semble déjà patché ({GUARD_COMMENT_SERVER!r} trouvé)")
        if not args.force:
            print(f"\n  {C.YELLOW}Pour forcer la ré-application : python integrate_messaging.py --force{C.RESET}")
            print(f"  {C.YELLOW}Abandon.{C.RESET}\n")
            sys.exit(0)
        warn("--force activé : ré-application malgré les patchs existants")

    # ── Étape 1 : Sauvegardes ─────────────────────────────────────────────────
    if not args.no_backup:
        step(1, "Création des sauvegardes")
        try:
            bkp_html   = backup(FILES['index'],  BACKUP_DIR, args.dry_run)
            bkp_server = backup(FILES['server'], BACKUP_DIR, args.dry_run)
            if not args.dry_run:
                ok(f"index.html  → {bkp_html.name}")
                ok(f"server.js   → {bkp_server.name}")
                reports['backups'] = {
                    'index.html': str(bkp_html),
                    'server.js':  str(bkp_server),
                }
        except Exception as e:
            err(f"Impossible de créer les sauvegardes : {e}")
            if not args.force:
                sys.exit(1)
    else:
        warn("Sauvegardes désactivées (--no-backup)")

    # ── Étape 2 : Patch server.js ─────────────────────────────────────────────
    step(2, "Patch server.js — Remplacement des routes messages")
    try:
        server_new, srv_report = patch_server(server_orig, backend_code)
        reports['server'] = srv_report
        ok(f"Bloc remplacé à la ligne {srv_report.get('anchor_line')}")
        ok(f"{srv_report.get('old_routes_lines')} lignes → {srv_report.get('new_routes_lines')} lignes")
        ok(f"{srv_report.get('routes_found')}/9 routes vérifiées")
    except ValueError as e:
        err(str(e))
        sys.exit(1)

    # ── Étape 3 : Patch index.html — Injection script ─────────────────────────
    step(3, "Patch index.html — Injection module messaging-frontend.js")
    try:
        html_new, html_report = patch_html_script(html_orig, frontend_code)
        reports['html_script'] = html_report
        ok(f"Script injecté à la ligne {html_report.get('inject_line')}")
        ok(f"{html_report.get('script_lines')} lignes / {html_report.get('script_chars'):,} chars")
    except ValueError as e:
        err(str(e))
        sys.exit(1)

    # ── Étape 4 : Patch index.html — MessagingBadge dans header ───────────────
    step(4, "Patch index.html — Injection MessagingBadge dans GlobalHeader")
    html_new, badge_report = patch_html_badge(html_new)
    reports['html_badge'] = badge_report
    if badge_report.get('badge_injected') is True:
        ok(f"MessagingBadge injecté à la ligne {badge_report.get('badge_line')}")
    elif badge_report.get('badge_injected') == 'already_present':
        ok("MessagingBadge déjà présent")
    else:
        warn("Badge non injecté — injection manuelle requise (voir guide)")

    # ── Étape 5 : Opener global ───────────────────────────────────────────────
    step(5, "Patch index.html — Fonction window.__nexusOpenMessaging")
    html_new, opener_report = patch_html_global_opener(html_new)
    reports['html_opener'] = opener_report
    if opener_report.get('opener_injected'):
        ok(f"Opener global injecté à la ligne {opener_report.get('opener_line')}")
    else:
        ok("Opener global déjà présent ou non applicable")

    # ── Étape 6 : Validations post-patch ──────────────────────────────────────
    step(6, "Validation des fichiers patchés")

    html_warns   = validate_html_output(html_new)
    server_warns = validate_server_output(server_new)

    all_warns = html_warns + server_warns
    if all_warns:
        for w in all_warns:
            warn(w)
        if not args.force:
            err("Des validations ont échoué. Utilisez --force pour ignorer.")
            sys.exit(1)
    else:
        ok(f"index.html OK — {line_count(html_new):,} lignes")
        ok(f"server.js  OK — {line_count(server_new):,} lignes")

    # ── Étape 7 : Écriture ────────────────────────────────────────────────────
    step(7, "Écriture des fichiers patchés")
    try:
        write(FILES['index'],  html_new,   args.dry_run)
        write(FILES['server'], server_new, args.dry_run)
        if not args.dry_run:
            ok(f"index.html écrit  ({FILES['index'].stat().st_size:,} octets)")
            ok(f"server.js écrit   ({FILES['server'].stat().st_size:,} octets)")
    except Exception as e:
        err(f"Erreur d'écriture : {e}")
        sys.exit(1)

    # ── Rapport ───────────────────────────────────────────────────────────────
    print_report(reports, start_time)

    # ── SQL Reminder ──────────────────────────────────────────────────────────
    sql_reminder = """
┌─────────────────────────────────────────────────────────┐
│  N'oubliez pas d'exécuter la migration SQL Supabase !   │
│                                                         │
│  ALTER TABLE messages                                   │
│    ADD COLUMN IF NOT EXISTS reply_to_id    uuid,        │
│    ADD COLUMN IF NOT EXISTS reply_to_text  text,        │
│    ADD COLUMN IF NOT EXISTS attachments    jsonb,       │
│    ADD COLUMN IF NOT EXISTS reactions      jsonb,       │
│    ADD COLUMN IF NOT EXISTS deleted_for    uuid[],      │
│    ADD COLUMN IF NOT EXISTS read_at        timestamptz; │
│                                                         │
│  Voir MESSAGING_INTEGRATION.md pour le SQL complet.    │
└─────────────────────────────────────────────────────────┘
"""
    print(C.YELLOW + sql_reminder + C.RESET)


if __name__ == '__main__':
    main()
