#!/usr/bin/env python3
"""
deploy_functions.py
───────────────────
Copie tous les fichiers générés par Claude vers leur destination
dans le projet Cloudflare Pages existant.

Usage :
    python deploy_functions.py

    # Spécifier un répertoire de projet différent :
    python deploy_functions.py --project /chemin/vers/mon-projet

    # Aperçu sans rien copier :
    python deploy_functions.py --dry-run

Structure de destination :
    <project>/
    ├── index.html
    └── functions/
        ├── _lib/auth.js
        └── api/
            ├── health.js
            ├── notifications.js
            ├── auth/
            │   ├── me.js
            │   ├── logout.js
            │   ├── change-password.js
            │   └── reset-password.js
            ├── admin/
            │   ├── logs.js
            │   ├── users/[id]/ban.js
            │   └── vendors/[id]/approve.js
            ├── email/
            │   └── logs.js
            ├── messages/
            │   ├── typing.js
            │   └── [msgId]/react.js
            ├── orders/
            │   ├── split.js
            │   └── [id]/status.js
            ├── payments/
            │   ├── paytech/
            │   │   ├── init.js
            │   │   ├── ipn.js
            │   │   └── verify/[orderId].js
            │   └── stripe/
            │       └── create-intent.js
            ├── payout/
            │   ├── history.js
            │   └── request.js
            ├── payouts/
            │   ├── balance.js
            │   └── process/[id]/index.js
            ├── users/
            │   └── search.js
            └── webhooks/
                └── stripe.js
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

# ── Répertoire source (fichiers téléchargés depuis Claude) ───────────────────
# Modifiez SOURCE_DIR si vos fichiers sont dans un autre dossier.
SOURCE_DIR = Path(__file__).parent

# ── Table de correspondance : nom de fichier source → chemin de destination ──
# Chemin relatif à la racine du projet (PROJECT_DIR).
FILE_MAP = {
    # ── Fichier principal ─────────────────────────────────────────────────────
    "index.html": "index.html",

    # ── Bibliothèque partagée ─────────────────────────────────────────────────
    "lib-auth.js": "functions/_lib/auth.js",

    # ── Route santé ──────────────────────────────────────────────────────────
    "health.js": "functions/api/health.js",

    # ── Notifications cross-user ─────────────────────────────────────────────
    "notifications.js": "functions/api/notifications.js",

    # ── Admin ─────────────────────────────────────────────────────────────────
    "admin-logs.js":           "functions/api/admin/logs.js",
    "admin-users-ban.js":      "functions/api/admin/users/[id]/ban.js",
    "admin-vendors-approve.js":"functions/api/admin/vendors/[id]/approve.js",

    # ── Email ─────────────────────────────────────────────────────────────────
    "email-logs.js": "functions/api/email/logs.js",

    # ── Messages ─────────────────────────────────────────────────────────────
    "messages-typing.js":  "functions/api/messages/typing.js",
    "messages-react.js":   "functions/api/messages/[msgId]/react.js",

    # ── Commandes ────────────────────────────────────────────────────────────
    "orders-split.js":  "functions/api/orders/split.js",
    "orders-status.js": "functions/api/orders/[id]/status.js",

    # ── Paiements PayTech ────────────────────────────────────────────────────
    "paytech-init.js":              "functions/api/payments/paytech/init.js",
    "paytech-ipn.js":               "functions/api/payments/paytech/ipn.js",
    "paytech-verify-[orderId].js":  "functions/api/payments/paytech/verify/[orderId].js",

    # ── Paiements Stripe ─────────────────────────────────────────────────────
    "stripe-create-intent.js": "functions/api/payments/stripe/create-intent.js",
    "stripe-webhook.js":        "functions/api/webhooks/stripe.js",

    # ── Portefeuille vendeur (payout = demandes, payouts = admin) ────────────
    "payout-history.js":  "functions/api/payout/history.js",
    "payout-request.js":  "functions/api/payout/request.js",
    "payouts-balance.js": "functions/api/payouts/balance.js",
    "payouts-process.js": "functions/api/payouts/process/[id]/index.js",

    # ── Recherche utilisateurs ────────────────────────────────────────────────
    "users-search.js": "functions/api/users/search.js",

    # ── Auth (Supabase Auth proxy — CF Pages) ─────────────────────────────────
    "auth-me.js":              "functions/api/auth/me.js",
    "auth-logout.js":          "functions/api/auth/logout.js",
    "auth-change-password.js": "functions/api/auth/change-password.js",
    "auth-reset-password.js":  "functions/api/auth/reset-password.js",
}

# ── Fichiers SQL (copiés à la racine du projet pour référence) ────────────────
SQL_FILES = [
    "nexus_ambassador_migration.sql",
    "nexus_backend_tables.sql",
    "nexus_rpc_migration.sql",
    "nexus_stripe_migration.sql",
    "nexus_tables_migration.sql",
]

# ─────────────────────────────────────────────────────────────────────────────

def color(code, text):
    return f"\033[{code}m{text}\033[0m" if sys.stdout.isatty() else text

OK    = lambda t: color("32", f"  ✅  {t}")
SKIP  = lambda t: color("33", f"  ⚠️   {t}")
ERR   = lambda t: color("31", f"  ❌  {t}")
INFO  = lambda t: color("36", f"  ℹ️   {t}")
HEAD  = lambda t: color("1",  f"\n{t}")

def copy_file(src: Path, dst: Path, dry_run: bool) -> str:
    """Copie src → dst. Retourne 'created', 'replaced' ou lève une exception."""
    existed = dst.exists()
    if not dry_run:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    return "replaced" if existed else "created"


def main():
    parser = argparse.ArgumentParser(description="Déploie les CF Functions NEXUS dans le projet.")
    parser.add_argument("--project", default=".", metavar="DIR",
                        help="Répertoire racine du projet Cloudflare Pages (défaut : .)")
    parser.add_argument("--source",  default=str(SOURCE_DIR), metavar="DIR",
                        help="Répertoire contenant les fichiers générés par Claude")
    parser.add_argument("--dry-run", action="store_true",
                        help="Affiche les opérations sans rien copier")
    parser.add_argument("--skip-html", action="store_true",
                        help="Ne pas copier index.html")
    parser.add_argument("--skip-sql",  action="store_true",
                        help="Ne pas copier les fichiers SQL")
    args = parser.parse_args()

    project = Path(args.project).resolve()
    source  = Path(args.source).resolve()

    print(HEAD("NEXUS Market — Déploiement des CF Functions"))
    print(INFO(f"Source  : {source}"))
    print(INFO(f"Projet  : {project}"))
    if args.dry_run:
        print(color("33", "  Mode dry-run — aucun fichier ne sera modifié\n"))

    if not project.exists():
        print(ERR(f"Répertoire projet introuvable : {project}"))
        sys.exit(1)

    created = replaced = skipped = errors = 0

    # ── Fichiers JS ───────────────────────────────────────────────────────────
    print(HEAD("Fonctions Cloudflare Pages (.js)"))
    for src_name, dst_rel in FILE_MAP.items():
        if args.skip_html and src_name == "index.html":
            continue

        src_path = source / src_name
        dst_path = project / dst_rel

        if not src_path.exists():
            print(SKIP(f"Source absente, ignorée : {src_name}"))
            skipped += 1
            continue

        try:
            result = copy_file(src_path, dst_path, args.dry_run)
            verb   = "→ remplacé" if result == "replaced" else "→ créé"
            print(OK(f"{src_name:<45} {verb}  ({dst_rel})"))
            if result == "replaced":
                replaced += 1
            else:
                created += 1
        except Exception as exc:
            print(ERR(f"{src_name} : {exc}"))
            errors += 1

    # ── Fichiers SQL ──────────────────────────────────────────────────────────
    if not args.skip_sql:
        print(HEAD("Scripts SQL (référence)"))
        sql_dir = project / "sql"
        for sql_name in SQL_FILES:
            src_path = source / sql_name
            if not src_path.exists():
                print(SKIP(f"Source absente, ignorée : {sql_name}"))
                skipped += 1
                continue
            dst_path = sql_dir / sql_name
            try:
                result = copy_file(src_path, dst_path, args.dry_run)
                verb   = "→ remplacé" if result == "replaced" else "→ créé"
                print(OK(f"{sql_name:<45} {verb}  (sql/{sql_name})"))
                if result == "replaced":
                    replaced += 1
                else:
                    created += 1
            except Exception as exc:
                print(ERR(f"{sql_name} : {exc}"))
                errors += 1

    # ── Résumé ────────────────────────────────────────────────────────────────
    print(HEAD("Résumé"))
    print(f"  Créés    : {created}")
    print(f"  Remplacés: {replaced}")
    print(f"  Ignorés  : {skipped}")
    print(f"  Erreurs  : {errors}")

    if errors:
        print(color("31", "\nDes erreurs sont survenues — vérifiez les chemins."))
        sys.exit(1)
    elif args.dry_run:
        print(color("33", "\nDry-run terminé — relancez sans --dry-run pour appliquer."))
    else:
        print(color("32", "\nDéploiement terminé ✅"))
        print(INFO("Commitez et poussez sur Cloudflare Pages pour déclencher le build."))


if __name__ == "__main__":
    main()