#!/usr/bin/env python3
"""
fix_import_paths.py
───────────────────
Corrige les chemins relatifs vers _lib/auth.js dans tous les fichiers
JS des CF Functions.

Wrangler résout les imports depuis l'emplacement réel du fichier sur
disque — les chemins générés avaient un niveau de trop.

Usage (depuis la racine du projet) :
    python fix_import_paths.py
    python fix_import_paths.py --functions-dir chemin/vers/functions
    python fix_import_paths.py --dry-run
"""

import argparse
import os
import re
import sys
from pathlib import Path


def color(code, text):
    return f"\033[{code}m{text}\033[0m" if sys.stdout.isatty() else text

OK   = lambda t: color("32", f"  ✅  {t}")
FIX  = lambda t: color("33", f"  🔧  {t}")
SKIP = lambda t: color("36", f"  –   {t}")
ERR  = lambda t: color("31", f"  ❌  {t}")
HEAD = lambda t: color("1",  f"\n{t}")


def correct_import_path(js_file: Path, functions_root: Path) -> str:
    """
    Calcule le chemin relatif correct de js_file vers
    functions_root/_lib/auth.js.
    """
    lib_path   = functions_root / "_lib" / "auth.js"
    rel        = os.path.relpath(lib_path, js_file.parent)
    # os.path.relpath renvoie des backslashes sur Windows → normaliser
    return rel.replace("\\", "/")


# Regex qui capture n'importe quelle référence à _lib/auth.js
# (peu importe le nombre de ../ devant)
IMPORT_RE = re.compile(
    r"""(from\s+["'])([^"']*/_lib/auth\.js)(["'])""",
    re.MULTILINE,
)


def fix_file(js_file: Path, functions_root: Path, dry_run: bool) -> str:
    """
    Lit js_file, corrige les imports _lib/auth.js, écrit si modifié.
    Retourne : 'fixed' | 'ok' | 'no_import'
    """
    content = js_file.read_text(encoding="utf-8")

    if "_lib/auth.js" not in content:
        return "no_import"

    correct = correct_import_path(js_file, functions_root)

    def replacer(m):
        current = m.group(2)
        if current == correct:
            return m.group(0)          # déjà correct
        return f"{m.group(1)}{correct}{m.group(3)}"

    new_content = IMPORT_RE.sub(replacer, content)

    if new_content == content:
        return "ok"

    if not dry_run:
        js_file.write_text(new_content, encoding="utf-8")
    return "fixed"


def main():
    parser = argparse.ArgumentParser(
        description="Corrige les chemins _lib/auth.js dans les CF Functions."
    )
    parser.add_argument(
        "--functions-dir", default="functions", metavar="DIR",
        help="Dossier functions/ du projet (défaut : ./functions)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Affiche les corrections sans modifier les fichiers"
    )
    args = parser.parse_args()

    functions_root = Path(args.functions_dir).resolve()

    if not functions_root.exists():
        print(ERR(f"Dossier introuvable : {functions_root}"))
        sys.exit(1)

    print(HEAD("Fix des chemins _lib/auth.js — CF Pages Functions"))
    print(f"  Dossier : {functions_root}")
    if args.dry_run:
        print(color("33", "  Mode dry-run — aucun fichier ne sera modifié\n"))

    fixed = ok = skipped = errors = 0

    js_files = sorted(functions_root.rglob("*.js"))
    if not js_files:
        print(ERR("Aucun fichier .js trouvé dans le dossier functions/."))
        sys.exit(1)

    for js_file in js_files:
        rel = js_file.relative_to(functions_root)

        # Ne jamais patcher le fichier _lib/auth.js lui-même
        if js_file == functions_root / "_lib" / "auth.js":
            skipped += 1
            continue

        try:
            result = fix_file(js_file, functions_root, args.dry_run)
            if result == "fixed":
                correct = correct_import_path(js_file, functions_root)
                print(FIX(f"{rel}  →  import corrigé vers  {correct}"))
                fixed += 1
            elif result == "ok":
                print(SKIP(f"{rel}  (chemin déjà correct)"))
                ok += 1
            else:
                skipped += 1   # pas d'import _lib, silencieux
        except Exception as e:
            print(ERR(f"{rel} : {e}"))
            errors += 1

    print(HEAD("Résumé"))
    print(f"  Corrigés  : {fixed}")
    print(f"  Déjà OK   : {ok}")
    print(f"  Sans import: {skipped}")
    print(f"  Erreurs   : {errors}")

    if errors:
        print(color("31", "\nErreurs détectées — vérifiez les fichiers ci-dessus."))
        sys.exit(1)
    elif fixed == 0:
        print(color("32", "\nTous les chemins sont déjà corrects ✅"))
    elif args.dry_run:
        print(color("33", f"\nDry-run terminé — {fixed} fichier(s) à corriger."
                           "\nRelancez sans --dry-run pour appliquer."))
    else:
        print(color("32", f"\n{fixed} fichier(s) corrigé(s) ✅"))
        print(color("36",  "  Commitez et poussez pour relancer le build Cloudflare."))


if __name__ == "__main__":
    main()