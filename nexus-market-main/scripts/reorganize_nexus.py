#!/usr/bin/env python3
"""
reorganize_nexus.py  v2.0
══════════════════════════════════════════════════════════════════════════════
Script de réorganisation complète du dépôt NEXUS Market.

Transforme la structure plate (tout à la racine) en monorepo propre :

  APRÈS
  ─────────────────────────────────────────────────
  nexus-market/
  ├── index.html                ← Frontend SPA
  ├── sw.js                     ← Service Worker
  ├── package.json              ← Cloudflare Pages (léger)
  ├── wrangler.toml             ← Config Cloudflare
  ├── netlify.toml              ← Config Netlify
  ├── _routes.json              ← Routage CF
  ├── render.yaml               ← Config Render
  ├── .env                      ← Secrets (gitignored)
  ├── .gitignore
  │
  ├── functions/                ← Cloudflare Pages Functions (ESM)
  │   ├── _middleware.js
  │   └── *.js
  │
  ├── netlify/functions/        ← Netlify Functions (CommonJS)
  │   └── *.js
  │
  ├── api/                      ← Backend Express (Render/Railway)
  │   ├── server.js
  │   ├── package.json
  │   ├── middleware.js
  │   ├── seed.js
  │   └── routes/               ← Routes Express
  │       ├── auth.js
  │       ├── orders.js
  │       └── ...
  │
  ├── database/                 ← SQL Supabase
  │   ├── schema.sql            ← Schéma principal
  │   └── migrations/           ← Migrations chronologiques
  │       └── *.sql
  │
  ├── docs/                     ← Documentation
  │   ├── DEPLOYMENT.md
  │   └── *.pdf
  │
  ├── devops/                   ← CI/CD, Docker, scripts deploy
  │   ├── Dockerfile
  │   ├── keep-alive.yml
  │   └── *.ps1
  │
  ├── assets/                   ← Images, médias
  │   └── *.png
  │
  ├── scripts/                  ← Scripts utilitaires Python/JS
  │   ├── reorganize_nexus.py
  │   ├── fix_supabase.py
  │   └── *.js
  │
  └── archive/                  ← Fichiers obsolètes / backups
      ├── index.html.backup
      └── ...

Usage :
  python3 reorganize_nexus.py --dry-run   # aperçu sans modifier
  python3 reorganize_nexus.py             # exécution réelle
  python3 reorganize_nexus.py --path /chemin/vers/nexus-market
══════════════════════════════════════════════════════════════════════════════
"""

import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

# ── Couleurs terminal ──────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):    print(f"  {GREEN}✓{RESET}  {msg}")
def warn(msg):  print(f"  {YELLOW}⚠{RESET}  {msg}")
def err(msg):   print(f"  {RED}✗{RESET}  {msg}")
def info(msg):  print(f"  {CYAN}→{RESET}  {msg}")
def title(msg): print(f"\n{BOLD}{msg}{RESET}")

# ══════════════════════════════════════════════════════════════════════════════
# CLASSIFICATION COMPLÈTE DES FICHIERS
# ══════════════════════════════════════════════════════════════════════════════

# Fonctions Netlify (CommonJS) → netlify/functions/
NETLIFY_FUNCTIONS = [
    "loyalty.js",
    "payout-history.js",
    "payout-request.js",
    "paytech-payout-webhook.js",
    "paytech-webhook.js",
    "payments-mobile-money.js",
    "push-send.js",
    "push-subscribe.js",
    "push-vapid-key.js",
]

# Routes Express → api/routes/
API_ROUTES = [
    "admin.js",
    "analytics.js",
    "auth.js",
    "health-route.js",
    "messaging-backend-routes.js",
    "orders.js",
    "products.js",
    "vendors.js",
]

# Fichiers dupliqués / variantes de routes → api/routes/ (renommés)
API_ROUTES_RENAME = {
    "auth (1).js": "auth.v2.js",   # doublon — renommé pour ne pas écraser
}

# Backend principal → api/
API_ROOT = [
    "server.js",
    "middleware.js",
    "create_admin.js",
    "nexus_migrate.js",
    "nexus_storage_supabase.js",
    "seed.js",
    "server_analytics_addon.js",
    "emailjs.js",
    "messaging-frontend.js",
    "index.ts",
]

# SQL schéma principal → database/
DB_SCHEMA = [
    "schema.sql",
    "nexus_schema_v3.3.6.sql",
    "all_supabase_final.sql",
    "supabase_migrations.sql",
]

# SQL migrations → database/migrations/
DB_MIGRATIONS = [
    "all supabase.txt",
    "deepseek_sql_20260423_26bb69.sql",
    "loyalty_migration.sql",
    "migration_messages_rls.sql",
    "nexus_invoices_v3_step1.sql",
    "nexus_invoices_v3_step2.sql",
    "nexus_migration.sql",
    "nexus_migration_v5_step1.sql",
    "nexus_migration_v5_step2.sql",
    "permissions_nexus.sql",
    "return_requests_migration.sql",
    "schema_analytics_v1.sql",
    "schema_migration_v3.2.sql",
    "schema_migration_v3_2.sql",
    "stock_realtime_migration.sql",
    "supabase_fts_migration 1.sql",
    "supabase_fts_migration.sql",
    "supabase_migration_payout.sql",
    "supabase_rls_fix.sql",
    "nexus_invoices_v3_step2.sql",
]

# Documentation → docs/
DOCS = [
    "DEPLOYMENT.md",
    "INTEGRATION.md",
    "MESSAGING_INTEGRATION.md",
    "features_audit_nexus_content.pdf",
    "NEXUS_Deployment_Guide.pdf",
    "NEXUS_Guide_Deploiement.pdf",
]

# DevOps / CI-CD → devops/
DEVOPS = [
    "Dockerfile",
    "dockerignore",       # sera copié en .dockerignore aussi
    "deploy-fixes.ps1",
    "keep-alive.yml",
    "nexus-start.ps1",
    "nixpacks.toml",
    "railway.toml",
    "next.config.js",
]

# Scripts utilitaires → scripts/
SCRIPTS_PY = [
    "reorganize_nexus.py",
    "fix_supabase.py",
    "integrate_messaging.py",
]
SCRIPTS_JS = [
    "nexus_migrate.js",   # aussi dans api/ — sera copié dans scripts/
]

# Images / assets → assets/
ASSETS = [
    "Gemini_Generated_Image_51w43151w43151w4.png",
    "Gemini_Generated_Image_9gffcb9gffcb9gff.png",
]

# HTML utilitaires / pages secondaires → tools/
TOOLS_HTML = [
    "nexus-confirm.html",
    "nexus_admin.html",
    "nexus_launch_checklist.html",
    "nexus_reset.html",
    "nexus_vendor_analytics.html",
    "index-head-patch.html",
    "index (1).ts",       # variante TypeScript
]

# Archive / obsolète → archive/
ARCHIVE = [
    "index.html.backup",
    "index_20260426_174121.html",
    "server.js.backup",
    "server_20260426_174121.js",
    "nexus-deploy-az-v4.html",
    "vercel-deploy-wizard.html",
    "package-lock.json",  # lockfile lié à l'ancien package.json Railway
]

# Fichiers qui RESTENT à la racine
ROOT_KEEP = [
    "index.html",
    "sw.js",
    ".env",
    "env",                # sera renommé en .env si .env absent
    ".gitignore",
    ".env.example",
    "README.md",
    "wrangler.toml",
    "netlify.toml",
    "_routes.json",
    "package.json",
    "render.yaml",
    "package-lock.json",  # sera archivé — Railway lockfile obsolète
]

# ── Tous les fichiers connus (union) ───────────────────────────────────────────
ALL_KNOWN = set(
    NETLIFY_FUNCTIONS
    + API_ROUTES
    + list(API_ROUTES_RENAME.keys())
    + API_ROOT
    + DB_SCHEMA
    + DB_MIGRATIONS
    + DOCS
    + DEVOPS
    + SCRIPTS_PY
    + SCRIPTS_JS
    + ASSETS
    + TOOLS_HTML
    + ARCHIVE
    + ROOT_KEEP
    + ["server.js", ".env", "env", "package.json"]
)


# ══════════════════════════════════════════════════════════════════════════════
# CONTENU DES FICHIERS DE CONFIG GÉNÉRÉS
# ══════════════════════════════════════════════════════════════════════════════

WRANGLER_TOML = """\
# wrangler.toml — NEXUS Market · Cloudflare Pages
name                   = "nexus-market"
pages_build_output_dir = "."
compatibility_flags    = ["nodejs_compat"]
compatibility_date     = "2024-09-23"

[vars]
PAYTECH_ENV  = "prod"
SITE_URL     = "https://nexus-market.pages.dev"
FRONTEND_URL = "https://nexus-market.pages.dev"
VAPID_EMAIL  = "mailto:admin@nexus-market.com"

# Secrets à définir via :  wrangler secret put NOM_SECRET
# Requis : SUPABASE_URL, SUPABASE_SERVICE_KEY, PAYTECH_API_KEY,
#          PAYTECH_SECRET_KEY, STRIPE_SECRET_KEY, VAPID_PUBLIC_KEY,
#          VAPID_PRIVATE_KEY, GROQ_API_KEY
"""

NETLIFY_TOML = """\
# netlify.toml — NEXUS Market · Netlify
[build]
  publish   = "."
  command   = ""
  functions = "netlify/functions"

[build.environment]
  NODE_ENV    = "production"
  PAYTECH_ENV = "prod"
  AWS_LAMBDA_JS_RUNTIME = "nodejs20.x"

[[redirects]]
  from   = "/api/payments/mobile-money"
  to     = "/.netlify/functions/payments-mobile-money"
  status = 200
  force  = true

[[redirects]]
  from   = "/api/payments/webhook"
  to     = "/.netlify/functions/paytech-webhook"
  status = 200
  force  = true

[[redirects]]
  from   = "/api/loyalty"
  to     = "/.netlify/functions/loyalty"
  status = 200
  force  = true

[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control          = "no-cache, no-store, must-revalidate"
    X-Frame-Options        = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy        = "strict-origin-when-cross-origin"
    Permissions-Policy     = "camera=(), microphone=(), geolocation=()"

[[headers]]
  for = "/.netlify/functions/*"
  [headers.values]
    Cache-Control                = "no-store"
    Access-Control-Allow-Origin  = "*"
    Access-Control-Allow-Methods = "POST, GET, DELETE, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type, Authorization"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache, no-store"
"""

ROUTES_JSON = """\
{
  "version": 1,
  "include": ["/functions/*", "/api/*"],
  "exclude": []
}
"""

ROOT_PACKAGE_JSON = """\
{
  "name": "nexus-market-frontend",
  "private": true,
  "description": "NEXUS Market — Frontend + Cloudflare Pages Functions",
  "scripts": {
    "dev":    "wrangler pages dev . --port 8788 --compatibility-flag nodejs_compat",
    "deploy": "wrangler pages deploy .",
    "lint":   "echo 'No linter configured'"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "web-push":              "^3.6.7"
  },
  "devDependencies": {
    "wrangler": "^3.78.0"
  }
}
"""

MIDDLEWARE_JS = """\
/**
 * functions/_middleware.js
 * Middleware Cloudflare Pages — CORS automatique sur toutes les routes /functions/*.
 */
export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(context.request) });
  }
  context.data.cors = () => corsHeaders(context.request);
  context.data.json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders(context.request) },
    });
  return context.next();
}

function corsHeaders(request) {
  const origin = request?.headers?.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin":      origin,
    "Access-Control-Allow-Methods":     "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":     "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary":                             "Origin",
  };
}
"""

RENDER_YAML = """\
# render.yaml — NEXUS Market API (Express)
services:
  - type: web
    name: nexus-market-api
    env: node
    region: frankfurt
    rootDir: api
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      # Secrets à définir dans le dashboard Render :
      # SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY,
      # PAYTECH_API_KEY, PAYTECH_SECRET_KEY, JWT_SECRET,
      # SMTP_USER, SMTP_PASS, GROQ_API_KEY
"""

# ══════════════════════════════════════════════════════════════════════════════
# CONVERTISSEUR CommonJS → ESM (Cloudflare Pages)
# ══════════════════════════════════════════════════════════════════════════════

def convert_to_esm(source: str, filename: str) -> str:
    """Convertit une Netlify Function CommonJS en Cloudflare Pages Function ESM."""
    out = source

    banner = f"""\
/**
 * functions/{filename}
 * Cloudflare Pages Function — adapté depuis la version Netlify CommonJS.
 * Généré par reorganize_nexus.py v2.0
 */
"""

    out = re.sub(
        r'const\s*\{\s*createClient\s*\}\s*=\s*require\(["\'"]@supabase/supabase-js["\']\);?',
        'import { createClient } from "@supabase/supabase-js";', out)
    out = re.sub(
        r'const\s+webpush\s*=\s*require\(["\']web-push["\']\);?',
        'import webpush from "web-push";', out)
    out = re.sub(r'const\s+crypto\s*=\s*require\(["\']crypto["\']\);?\n?', '', out)
    out = re.sub(r'const\s+https\s*=\s*require\(["\']https["\']\);?\n?',  '', out)

    out = re.sub(r'process\.env\.([A-Z_][A-Z0-9_]*)', r'env.\1', out)
    out = re.sub(r'exports\.handler\s*=\s*async\s*\(event\)\s*=>',
                 'export async function onRequest(context)', out)
    out = re.sub(r'exports\.handler\s*=\s*async\s*\(event,\s*context\)\s*=>',
                 'export async function onRequest(context)', out)
    out = re.sub(r'(export async function onRequest\(context\)\s*\{)',
                 r'\1\n  const { request, env } = context;', out)

    out = out.replace('event.httpMethod', 'request.method')
    out = re.sub(r'event\.headers\?\?\[["\']([\w-]+)["\']\]',
                 lambda m: f'request.headers.get("{m.group(1)}")', out)
    out = re.sub(r'event\.headers\??\.([\w-]+)',
                 lambda m: f'request.headers.get("{m.group(1)}")', out)
    out = out.replace('event.body', 'await request.text()')
    out = re.sub(r'JSON\.parse\(await request\.text\(\)[^)]*\)', 'await request.json()', out)
    out = re.sub(
        r'return\s*\{\s*statusCode:\s*(\d+),\s*headers,\s*body:\s*JSON\.stringify\(([^)]+)\)\s*\}',
        r'return new Response(JSON.stringify(\2), { status: \1, headers })', out)
    out = re.sub(
        r'return\s*\{\s*statusCode:\s*(204),\s*headers[^,]*,\s*body:\s*""\s*\}',
        r'return new Response(null, { status: 204, headers })', out)
    out = re.sub(
        r'return\s*\{\s*statusCode:\s*(\d+),\s*headers,\s*body:\s*""\s*\}',
        r'return new Response("", { status: \1, headers })', out)

    if 'crypto.createHash' in out:
        out = "// NOTE: crypto Node.js → Web Crypto API (crypto.subtle)\n" + out

    if out.startswith('/**'):
        out = banner + out[out.find('*/') + 2:].lstrip()
    else:
        out = banner + out

    return out


# ══════════════════════════════════════════════════════════════════════════════
# CLASSE PRINCIPALE
# ══════════════════════════════════════════════════════════════════════════════

class NexusReorganizer:
    def __init__(self, root: Path, dry_run: bool = False):
        self.root    = root
        self.dry_run = dry_run
        self.moved   = []
        self.unknown = []

    # ── Utilitaires ────────────────────────────────────────────────────────────

    def _ensure_dir(self, path: Path):
        if not self.dry_run:
            path.mkdir(parents=True, exist_ok=True)
        else:
            info(f"[dry] mkdir -p {self._rel(path)}")

    def _rel(self, p: Path) -> str:
        try:    return str(p.relative_to(self.root))
        except: return str(p)

    def _move(self, src: Path, dst: Path, note: str = ""):
        if not src.exists():
            return
        rsrc, rdst = self._rel(src), self._rel(dst)
        if self.dry_run:
            info(f"[dry] mv  {rsrc}  →  {rdst}  {note}")
            return
        self._ensure_dir(dst.parent)
        if dst.exists():
            warn(f"Dest. existe déjà, ignoré : {rdst}")
            return
        shutil.move(str(src), str(dst))
        ok(f"mv  {rsrc}  →  {rdst}  {note}")
        self.moved.append((rsrc, rdst))

    def _copy_esm(self, src: Path, dst: Path):
        if not src.exists():
            return
        if self.dry_run:
            info(f"[dry] esm  {self._rel(src)}  →  {self._rel(dst)}")
            return
        self._ensure_dir(dst.parent)
        if dst.exists():
            warn(f"ESM déjà présent, ignoré : {self._rel(dst)}")
            return
        original  = src.read_text(encoding="utf-8")
        converted = convert_to_esm(original, dst.name)
        dst.write_text(converted, encoding="utf-8")
        ok(f"esm  {self._rel(src)}  →  {self._rel(dst)}")

    def _write(self, path: Path, content: str, note: str = ""):
        rpath = self._rel(path)
        if self.dry_run:
            info(f"[dry] write  {rpath}  {note}")
            return
        self._ensure_dir(path.parent)
        if path.exists():
            shutil.copy2(str(path), str(path) + ".bak")
            warn(f"Sauvegardé {rpath}.bak avant remplacement")
        path.write_text(content, encoding="utf-8")
        ok(f"write  {rpath}  {note}")

    def _move_list(self, names: list, dst_dir: Path, note: str = ""):
        for name in names:
            src = self.root / name
            if src.exists():
                self._move(src, dst_dir / name, note)

    # ── Analyse ────────────────────────────────────────────────────────────────

    def analyse(self):
        title("═══ ANALYSE DU DÉPÔT ═══")
        root_files = sorted(f for f in self.root.iterdir() if f.is_file())
        unknown    = []
        for f in root_files:
            name = f.name
            if (name not in ALL_KNOWN
                    and not name.startswith(".")
                    and name not in ("netlify.toml", "wrangler.toml",
                                     "_routes.json", "render.yaml")):
                unknown.append(name)
        if unknown:
            print(f"\n  {YELLOW}Fichiers non reconnus par ce script :{RESET}")
            for n in unknown:
                print(f"    ? {n}")
            self.unknown = unknown
        else:
            ok("Tous les fichiers à la racine sont reconnus.")

        existing_dirs = [d.name for d in self.root.iterdir() if d.is_dir()]
        if existing_dirs:
            print(f"\n  Dossiers existants : {', '.join(existing_dirs)}")

    # ── Étapes ─────────────────────────────────────────────────────────────────

    def step_backup(self):
        if self.dry_run:
            info("[dry] Backup ignoré")
            return
        ts      = datetime.now().strftime("%Y%m%d_%H%M%S")
        archive = self.root.parent / f"nexus-market_backup_{ts}"
        info(f"Sauvegarde → {archive}.tar.gz …")
        shutil.make_archive(str(archive), "gztar", str(self.root))
        ok(f"Backup : {archive}.tar.gz")

    def step_env(self):
        """Renomme 'env' en '.env' si .env absent."""
        title("─── 0. Environnement ───")
        env_plain = self.root / "env"
        env_dot   = self.root / ".env"
        if env_plain.exists() and not env_dot.exists():
            self._move(env_plain, env_dot, "(renommé en .env)")
        elif env_plain.exists() and env_dot.exists():
            warn("env ET .env coexistent — 'env' archivé")
            self._move(env_plain, self.root / "archive" / "env.bak")

    def step_netlify_functions(self):
        title("─── 1. Fonctions Netlify → netlify/functions/ ───")
        dst = self.root / "netlify" / "functions"
        self._ensure_dir(dst)
        for name in NETLIFY_FUNCTIONS:
            src = self.root / name
            if src.exists():
                self._move(src, dst / name)
            else:
                # Peut être déjà dans netlify/functions/
                if (dst / name).exists():
                    ok(f"Déjà en place : netlify/functions/{name}")
                else:
                    warn(f"Introuvable : {name}")

    def step_cloudflare_functions(self):
        title("─── 2. Cloudflare Pages Functions → functions/ (ESM) ───")
        dst = self.root / "functions"
        self._ensure_dir(dst)

        # Middleware
        mw = dst / "_middleware.js"
        if not mw.exists():
            self._write(mw, MIDDLEWARE_JS, "(CORS middleware)")

        # Convertir chaque fonction
        for name in NETLIFY_FUNCTIONS:
            src_netlify = self.root / "netlify" / "functions" / name
            src_root    = self.root / name
            src = src_netlify if src_netlify.exists() else (src_root if src_root.exists() else None)
            if src is None:
                warn(f"Source introuvable pour functions/{name}")
                continue
            self._copy_esm(src, dst / name)

    def step_api(self):
        title("─── 3. Backend Express → api/ ───")
        api = self.root / "api"
        routes = api / "routes"
        self._ensure_dir(api)
        self._ensure_dir(routes)

        # Fichiers backend racine
        for name in API_ROOT:
            src = self.root / name
            if src.exists():
                self._move(src, api / name)

        # server.js spécial
        sv = self.root / "server.js"
        if sv.exists():
            self._move(sv, api / "server.js")

        # Routes
        for name in API_ROUTES:
            src = self.root / name
            if src.exists():
                self._move(src, routes / name)
            elif (api / name).exists():
                self._move(api / name, routes / name)

        # Variantes renommées
        for src_name, dst_name in API_ROUTES_RENAME.items():
            src = self.root / src_name
            if src.exists():
                self._move(src, routes / dst_name, f"(renommé depuis {src_name})")

    def step_database(self):
        title("─── 4. SQL → database/ ───")
        db  = self.root / "database"
        mig = db / "migrations"
        self._ensure_dir(db)
        self._ensure_dir(mig)

        for name in DB_SCHEMA:
            src = self.root / name
            if src.exists():
                self._move(src, db / name)

        for name in DB_MIGRATIONS:
            src = self.root / name
            if src.exists():
                # Normaliser les espaces dans le nom de fichier
                safe_name = name.replace(" ", "_")
                self._move(src, mig / safe_name)

    def step_docs(self):
        title("─── 5. Documentation → docs/ ───")
        docs = self.root / "docs"
        self._ensure_dir(docs)
        self._move_list(DOCS, docs)

    def step_devops(self):
        title("─── 6. DevOps / CI-CD → devops/ ───")
        dv = self.root / "devops"
        self._ensure_dir(dv)

        for name in DEVOPS:
            src = self.root / name
            if src.exists():
                # .dockerignore doit rester à la racine ET être dans devops/
                if name == "dockerignore":
                    dst_dot = self.root / ".dockerignore"
                    if not dst_dot.exists() and not self.dry_run:
                        shutil.copy2(str(src), str(dst_dot))
                        ok(f"cp  {name}  →  .dockerignore (racine)")
                self._move(src, dv / name)

    def step_assets(self):
        title("─── 7. Assets / Images → assets/ ───")
        assets = self.root / "assets"
        self._ensure_dir(assets)
        self._move_list(ASSETS, assets)

    def step_scripts(self):
        title("─── 8. Scripts utilitaires → scripts/ ───")
        scripts = self.root / "scripts"
        self._ensure_dir(scripts)
        self._move_list(SCRIPTS_PY, scripts)
        # nexus_migrate.js : copie dans scripts/ (original déjà dans api/)
        nm = self.root / "nexus_migrate.js"
        if nm.exists():
            self._move(nm, scripts / "nexus_migrate.js")

    def step_tools_html(self):
        title("─── 9. HTML utilitaires → tools/ ───")
        tools = self.root / "tools"
        self._ensure_dir(tools)
        self._move_list(TOOLS_HTML, tools)

    def step_archive(self):
        title("─── 10. Archivage fichiers obsolètes → archive/ ───")
        arc = self.root / "archive"
        self._ensure_dir(arc)
        self._move_list(ARCHIVE, arc)

        # Archiver aussi les backups serveur
        for pattern in ["*.backup", "*_backup_*.js", "*_backup_*.html"]:
            for f in self.root.glob(pattern):
                self._move(f, arc / f.name)

    def step_root_configs(self):
        title("─── 11. Fichiers de config racine ───")
        configs = {
            "wrangler.toml":  WRANGLER_TOML,
            "netlify.toml":   NETLIFY_TOML,
            "_routes.json":   ROUTES_JSON,
            "package.json":   ROOT_PACKAGE_JSON,
            "render.yaml":    RENDER_YAML,
        }
        for name, content in configs.items():
            self._write(self.root / name, content, f"({name})")

    def step_gitignore(self):
        title("─── 12. .gitignore ───")
        gi = self.root / ".gitignore"
        additions = [
            "# Environnement",
            ".env", ".env.local", "*.env", ".dev.vars",
            "",
            "# Node",
            "node_modules/", "npm-debug.log*",
            "",
            "# Wrangler / Cloudflare",
            ".wrangler/",
            "",
            "# Netlify",
            ".netlify/",
            "",
            "# Archives / backups",
            "*.bak", "*.tar.gz", "archive/",
            "",
            "# Docker",
            ".dockerignore",
            "",
            "# OS",
            ".DS_Store", "Thumbs.db",
        ]
        if gi.exists():
            existing = gi.read_text(encoding="utf-8")
            to_add   = [l for l in additions if l.strip() and l not in existing]
            if to_add:
                self._write(gi, existing.rstrip() + "\n\n" + "\n".join(to_add) + "\n", "(mis à jour)")
            else:
                ok(".gitignore déjà à jour")
        else:
            self._write(gi, "\n".join(additions) + "\n", "(créé)")

    def step_summary(self):
        title("═══ RÉSUMÉ ═══")
        print(f"""
Nouvelle structure :

  nexus-market/
  ├── index.html              ← Frontend SPA
  ├── sw.js                   ← Service Worker
  ├── package.json            ← Cloudflare Pages
  ├── wrangler.toml           ← Config Cloudflare
  ├── netlify.toml            ← Config Netlify
  ├── _routes.json
  ├── render.yaml
  ├── .env                    ← Secrets (gitignored)
  │
  ├── functions/              ← Cloudflare Pages Functions (ESM)
  ├── netlify/functions/      ← Netlify Functions (CommonJS)
  ├── api/
  │   ├── server.js
  │   └── routes/             ← Routes Express
  ├── database/
  │   ├── schema.sql
  │   └── migrations/         ← {len(DB_MIGRATIONS)} fichiers SQL
  ├── docs/                   ← Documentation
  ├── devops/                 ← Docker, CI/CD, scripts deploy
  ├── assets/                 ← Images
  ├── scripts/                ← Scripts Python/JS utilitaires
  ├── tools/                  ← HTML utilitaires
  └── archive/                ← Fichiers obsolètes / backups
""")

        if self.unknown:
            print(f"  {YELLOW}⚠  Fichiers non classifiés (à traiter manuellement) :{RESET}")
            for n in self.unknown:
                print(f"    ? {n}")

        print(f"\n{BOLD}Prochaines étapes :{RESET}")
        steps = [
            ("$", "npm install                    # dépendances Cloudflare (racine)"),
            ("$", "cd api && npm install && cd .. # dépendances Express"),
            ("#", "Déploiement Netlify : git push (auto-deploy)"),
            ("$", "npx wrangler pages deploy .    # Cloudflare Pages"),
            ("#", "Render : rootDir = api dans le dashboard"),
            ("#", "Supabase : exécuter database/migrations/*.sql dans SQL Editor"),
        ]
        for prefix, step in steps:
            c = CYAN if prefix == "#" else GREEN
            print(f"  {c}{prefix}{RESET} {step}")

    # ── Runner ─────────────────────────────────────────────────────────────────

    def run(self):
        print(f"\n{BOLD}{'═'*62}{RESET}")
        print(f"{BOLD}  NEXUS Market — Réorganisation v2.0{RESET}")
        if self.dry_run:
            print(f"  {YELLOW}MODE DRY-RUN : aucune modification effectuée{RESET}")
        print(f"{BOLD}{'═'*62}{RESET}")
        print(f"\n  Dossier cible : {CYAN}{self.root}{RESET}")

        if not self.root.exists():
            err(f"Dossier introuvable : {self.root}")
            sys.exit(1)

        if not (self.root / "index.html").exists():
            warn("index.html absent — vérifiez le chemin.")

        self.analyse()

        if not self.dry_run:
            self.step_backup()

        self.step_env()
        self.step_netlify_functions()
        self.step_cloudflare_functions()
        self.step_api()
        self.step_database()
        self.step_docs()
        self.step_devops()
        self.step_assets()
        self.step_scripts()
        self.step_tools_html()
        self.step_archive()
        self.step_root_configs()
        self.step_gitignore()
        self.step_summary()

        verdict = "Dry-run terminé." if self.dry_run else f"{GREEN}{BOLD}Réorganisation terminée !{RESET}"
        print(f"\n{verdict}\n")


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Réorganise le dépôt NEXUS Market en structure monorepo.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--path",    default=".", help="Chemin vers le dépôt (défaut : .)")
    parser.add_argument("--dry-run", action="store_true", help="Aperçu sans modifications")
    args = parser.parse_args()
    NexusReorganizer(Path(args.path).resolve(), dry_run=args.dry_run).run()

if __name__ == "__main__":
    main()
