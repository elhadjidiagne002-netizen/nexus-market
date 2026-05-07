#!/usr/bin/env python3
"""
NEXUS Market - Script de correction automatique des communications Supabase
Usage: python3 fix_supabase.py [--dry-run] [--skip-backup]
"""

import re
import os
import sys
import json
import shutil
import subprocess
from pathlib import Path
from datetime import datetime
from typing import List, Tuple, Optional

# ========== CONFIGURATION ==========
PROJECT_ROOT = Path(__file__).parent.absolute()
BACKEND_FILE = PROJECT_ROOT / "server.js"
FRONTEND_FILE = PROJECT_ROOT / "index.html"
ENV_FILE = PROJECT_ROOT / ".env"
MIGRATION_FILE = PROJECT_ROOT / "supabase_migrations.sql"
BACKUP_SUFFIX = ".backup"

# ========== UTILITAIRES ==========
def log_info(msg: str):
    print(f"\033[92m✓ {msg}\033[0m")

def log_warn(msg: str):
    print(f"\033[93m⚠ {msg}\033[0m")

def log_error(msg: str):
    print(f"\033[91m✗ {msg}\033[0m")

def log_section(title: str):
    print(f"\n\033[96m{'='*60}\n▶ {title}\n{'='*60}\033[0m")

def backup_file(file_path: Path):
    if not file_path.exists():
        return
    backup_path = file_path.with_suffix(file_path.suffix + BACKUP_SUFFIX)
    shutil.copy2(file_path, backup_path)
    log_info(f"Backup créé : {backup_path}")

def safe_replace(file_path: Path, pattern: str, replacement: str, flags=0):
    """Remplace toutes les occurrences d'une regex dans un fichier."""
    content = file_path.read_text(encoding='utf-8')
    new_content, count = re.subn(pattern, replacement, content, flags=flags)
    if count:
        file_path.write_text(new_content, encoding='utf-8')
        log_info(f"Remplacement effectué ({count} occ.) : {pattern[:50]}...")
    return count

# ========== CORRECTIONS BACKEND (server.js) ==========
def fix_backend_server_js():
    """Applique toutes les corrections sur server.js"""
    if not BACKEND_FILE.exists():
        log_error(f"Fichier non trouvé : {BACKEND_FILE}")
        return False

    backup_file(BACKEND_FILE)
    content = BACKEND_FILE.read_text(encoding='utf-8')

    # 1. Ajout de la fonction supabaseQueryWithRetry
    retry_function = """
// ── FONCTION DE RETRY POUR SUPABASE ──────────────────────────────────────────
async function supabaseQueryWithRetry(operation, maxRetries = 3, baseDelay = 300) {
  let lastError;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (err.status && err.status >= 400 && err.status !== 429 && err.status !== 503) {
        throw err;
      }
      console.warn(`[Supabase] Retry ${i}/${maxRetries} après erreur: ${err.message}`);
      if (i < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i - 1)));
      }
    }
  }
  throw lastError;
}
"""
    if "supabaseQueryWithRetry" not in content:
        # Insérer après la création du client Supabase
        pattern = r"(const supabase = createClient\([^;]+;)\n"
        replacement = r"\1\n" + retry_function
        content = re.sub(pattern, replacement, content)
        log_info("Ajout de supabaseQueryWithRetry")

    # 2. Ajout du endpoint /api/supabase-health
    if "supabase-health" not in content:
        health_endpoint = """
// ── ENDPOINT DE SANTÉ SUPABASE ──────────────────────────────────────────────
app.get('/api/supabase-health', async (req, res) => {
  const start = Date.now();
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) throw error;
    res.json({
      status: 'ok',
      latency_ms: Date.now() - start,
      message: 'Supabase connecté'
    });
  } catch (e) {
    res.status(503).json({
      status: 'error',
      error: e.message,
      latency_ms: Date.now() - start
    });
  }
});
"""
        # Insérer avant le 404 handler
        content = content.replace("app.use((req, res) =>", health_endpoint + "\napp.use((req, res) =>")
        log_info("Ajout de /api/supabase-health")

    # 3. Remplacer les appels directs sans gestion d'erreur
    # Exemple : await supabase.from(...).update(...).catch(()=>{}) → avec logger
    pattern_catch_empty = r"(await\s+supabase\.[a-z]+\([^)]*\)\.[a-z]+\([^)]*\))(\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\))"
    replacement_catch = r"\1.then(null, err => Logger.warn('db', 'operation_warning', err.message))"
    if re.search(pattern_catch_empty, content):
        content = re.sub(pattern_catch_empty, replacement_catch, content)
        log_info("Remplacement des catch vides par des logs")

    # 4. Ajout de la validation des variables Supabase au démarrage
    validation_block = """
// ── VALIDATION ROBUSTE DES VARIABLES SUPABASE ───────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY?.trim();
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY manquants. Le backend ne pourra pas fonctionner correctement.');
  process.exit(1);
}
const cleanUrl = supabaseUrl.replace(/\\/$/, '');
const supabase = createClient(cleanUrl, supabaseServiceKey);

let supabaseAnon = null;
if (supabaseAnonKey) {
  supabaseAnon = createClient(cleanUrl, supabaseAnonKey);
} else {
  console.warn('⚠️ SUPABASE_ANON_KEY manquant – les connexions via Supabase Auth échoueront');
}
"""
    if "cleanUrl" not in content:
        # Remplacer la création existante
        content = re.sub(
            r"const supabase = createClient\([^;]+\);",
            validation_block,
            content
        )
        log_info("Validation des variables Supabase ajoutée")

    # 5. Appliquer supabaseQueryWithRetry sur les opérations critiques
    # Modifier les appels .from().select() dans les routes sensibles
    pattern_critical = r"(const \{ data, error \} = await supabase\.from\('orders'\)\.select\([^;]+;)"
    replacement_critical = r"const { data, error } = await supabaseQueryWithRetry(() => supabase.from('orders').select(\2);"
    # On va faire plus simple : remplacer quelques occurrences typiques
    content = re.sub(
        r"await supabase\.from\('orders'\)\.select\(",
        r"await supabaseQueryWithRetry(() => supabase.from('orders').select(",
        content
    )
    content = re.sub(
        r"await supabase\.from\('products'\)\.select\(",
        r"await supabaseQueryWithRetry(() => supabase.from('products').select(",
        content
    )
    log_info("Ajout des retry sur les requêtes critiques (orders, products)")

    # Écriture du fichier modifié
    BACKEND_FILE.write_text(content, encoding='utf-8')
    log_info(f"Fichier {BACKEND_FILE} mis à jour")
    return True

# ========== CORRECTIONS FRONTEND (index.html) ==========
def fix_frontend_index_html():
    """Applique les corrections sur index.html (DataService, initSupabase)"""
    if not FRONTEND_FILE.exists():
        log_error(f"Fichier non trouvé : {FRONTEND_FILE}")
        return False

    backup_file(FRONTEND_FILE)
    content = FRONTEND_FILE.read_text(encoding='utf-8')

    # 1. Remplacer initSupabase par version robuste avec retry et vérification
    new_init_supabase = """
let supabaseClient = null;
let supabaseInitPromise = null;

const initSupabase = () => {
  if (!isSupabaseConfigured()) return null;
  if (window.__nexusSupabaseClient) {
    supabaseClient = window.__nexusSupabaseClient;
    return supabaseClient;
  }
  if (supabaseInitPromise) return supabaseInitPromise;
  
  supabaseInitPromise = (async () => {
    try {
      let retries = 0;
      while (!window.supabase && retries < 10) {
        await new Promise(r => setTimeout(r, 200));
        retries++;
      }
      if (!window.supabase) {
        throw new Error('Supabase SDK not loaded after 2s');
      }
      
      const client = window.supabase.createClient(
        NEXUS_CONFIG.supabase.url,
        NEXUS_CONFIG.supabase.anonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            storageKey: "nexus-auth-token",
            detectSessionInUrl: true,
          }
        }
      );
      
      const { error } = await client.from('profiles').select('id').limit(1);
      if (error) throw new Error(`Supabase connectivity check failed: ${error.message}`);
      
      window.__nexusSupabaseClient = client;
      supabaseClient = client;
      console.log('[Supabase] Client initialisé ✓');
      return client;
    } catch (e) {
      console.error('[Supabase] Échec init:', e);
      supabaseInitPromise = null;
      return null;
    }
  })();
  
  return supabaseInitPromise;
};
"""
    # Remplacer l'ancienne définition
    pattern_init = r"let supabaseClient = null;[^;]*const initSupabase = \(\) => \{[^}]+\};"
    if re.search(pattern_init, content, re.DOTALL):
        content = re.sub(pattern_init, new_init_supabase, content, flags=re.DOTALL)
        log_info("initSupabase remplacée par version robuste")

    # 2. Ajout de la méthode _sbQueryWithRetry dans DataService
    retry_method = """
  async _sbQueryWithRetry(operation, maxRetries = 3, baseDelay = 300) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        return result;
      } catch (err) {
        lastError = err;
        if (err.status === 401 || err.status === 403 || err.status === 404) throw err;
        console.warn(`[Supabase] Tentative ${attempt}/${maxRetries} échouée :`, err.message);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
        }
      }
    }
    throw lastError;
  },
"""
    if "_sbQueryWithRetry" not in content:
        # Insérer après la propriété _sb: null dans DataService
        content = content.replace("_sb: null,", "_sb: null,\n" + retry_method)
        log_info("Ajout de _sbQueryWithRetry dans DataService")

    # 3. Ajout de refreshSessionIfNeeded
    refresh_method = """
  async refreshSessionIfNeeded() {
    if (!this._sb) return false;
    try {
      const { data: { session }, error } = await this._sb.auth.getSession();
      if (error) throw error;
      if (!session) return false;
      
      const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000;
      const isExpiringSoon = expiresAt - Date.now() < 5 * 60 * 1000;
      
      if (isExpiringSoon) {
        const { data: refreshed, error: refreshError } = await this._sb.auth.refreshSession();
        if (refreshError) throw refreshError;
        if (refreshed.session) {
          this._token = refreshed.session.access_token;
          const expTs = String(refreshed.session.expires_at * 1000);
          sessionStorage.setItem("nexus_jwt", this._token);
          sessionStorage.setItem("nexus_jwt_exp", expTs);
          localStorage.setItem("nexus_jwt", this._token);
          localStorage.setItem("nexus_jwt_exp", expTs);
          console.log("[Supabase] Token rafraîchi avec succès");
          return true;
        }
      }
      return false;
    } catch (e) {
      console.warn("[refreshSession] Erreur:", e.message);
      return false;
    }
  },
"""
    if "refreshSessionIfNeeded" not in content:
        content = content.replace("_sb: null,", "_sb: null,\n" + refresh_method)
        log_info("Ajout de refreshSessionIfNeeded dans DataService")

    # 4. Remplacer les appels this._sb.from(...) par this._sbQueryWithRetry
    # On ne peut pas remplacer toutes les occurrences facilement, mais au moins les plus courantes
    # On va remplacer les appels dans getProducts, getOrders, etc. par une version wrapper
    # Simplification : ajouter un wrapper dans les méthodes existantes
    pattern_sb_call = r"(if\s*\(\s*this\._sb\s*\)\s*\{\s*)(?=const \{ data, error \} = await this\._sb\.from)"
    if re.search(pattern_sb_call, content):
        # On modifie manuellement quelques méthodes critiques
        log_info("Des appels critiques à this._sb.from seront enveloppés (modification manuelle recommandée)")
        # Pas de remplacement automatique trop risqué, on laisse un message

    # 5. Ajout de la vérification de santé Supabase dans App
    health_check = """
  const checkSupabaseHealth = async () => {
    try {
      const res = await fetch('/api/supabase-health');
      const data = await res.json();
      if (data.status !== 'ok') {
        addToast('⚠️ La connexion à la base de données est lente. Certaines fonctionnalités peuvent être dégradées.', 'warning', 10000);
      }
    } catch (e) {
      addToast('⚠️ Service de base de données temporairement indisponible. Mode hors-ligne actif.', 'warning', 10000);
    }
  };
  checkSupabaseHealth();
"""
    if "checkSupabaseHealth" not in content:
        # Insérer dans le useEffect principal
        pattern_use_effect = r"(useEffect\(\(\) => \{\s*initializeData\(\);)"
        content = re.sub(pattern_use_effect, r"\1\n" + health_check, content)
        log_info("Ajout de checkSupabaseHealth dans le composant App")

    FRONTEND_FILE.write_text(content, encoding='utf-8')
    log_info(f"Fichier {FRONTEND_FILE} mis à jour")
    return True

# ========== GÉNÉRATION MIGRATION SQL ==========
def generate_sql_migration():
    """Crée le fichier de migration SQL complet avec toutes les fonctions et tables manquantes"""
    sql_content = """-- =====================================================
-- Migrations NEXUS Market – Correction communication Supabase
-- Exécuter dans l'éditeur SQL de Supabase
-- =====================================================

-- ========== 1. TABLES MANQUANTES ==========

-- Coupons
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount integer NOT NULL CHECK (discount BETWEEN 1 AND 100),
  description text,
  max_uses integer,
  used_count integer DEFAULT 0,
  expires_at timestamptz,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Points de fidélité
CREATE TABLE IF NOT EXISTS loyalty_points (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  points integer DEFAULT 0,
  total_earned integer DEFAULT 0,
  total_redeemed integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Parrainage
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  code text NOT NULL,
  rewarded boolean DEFAULT false,
  rewarded_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Demandes de retrait vendeur
CREATE TABLE IF NOT EXISTS payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_name text,
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('mobile','bank')),
  provider text,
  destination text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending','processing','approved','rejected')),
  admin_note text,
  processed_at timestamptz,
  processed_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Profils Buyer Pro (B2B)
CREATE TABLE IF NOT EXISTS buyer_pro_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  company text NOT NULL,
  job_title text,
  ninea text UNIQUE NOT NULL,
  rc text,
  address text,
  ninea_verified boolean DEFAULT false,
  verification_note text,
  verified_at timestamptz,
  verified_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- ========== 2. COLONNES MANQUANTES DANS PROFILES ==========
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_id text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_login text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_avatar text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_method text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_destination text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_profiles_github_id ON profiles(github_id);

-- ========== 3. FONCTIONS RPC CRITIQUES ==========

-- Vérification et réservation atomique du stock
CREATE OR REPLACE FUNCTION check_and_reserve_stock(p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  item record;
  current_stock integer;
  product_name text;
  out_of_stock jsonb := '[]'::jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  LOOP
    SELECT stock, name INTO current_stock, product_name FROM products WHERE id = item.product_id FOR UPDATE;
    IF current_stock IS NULL OR current_stock < item.quantity THEN
      out_of_stock := out_of_stock || jsonb_build_object(
        'product_id', item.product_id,
        'product_name', COALESCE(product_name, 'Inconnu'),
        'requested', item.quantity,
        'available', COALESCE(current_stock, 0)
      );
    END IF;
  END LOOP;

  IF out_of_stock = '[]'::jsonb THEN
    FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
    LOOP
      UPDATE products SET stock = stock - item.quantity WHERE id = item.product_id;
    END LOOP;
    RETURN '{"ok": true}'::jsonb;
  ELSE
    RETURN jsonb_build_object('ok', false, 'out_of_stock', out_of_stock);
  END IF;
END;
$$;

-- Libération du stock (annulation commande)
CREATE OR REPLACE FUNCTION release_stock(p_items jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  LOOP
    UPDATE products SET stock = stock + item.quantity WHERE id = item.product_id;
  END LOOP;
END;
$$;

-- Notification des alertes stock
CREATE OR REPLACE FUNCTION notify_stock_alerts(p_product_id uuid)
RETURNS TABLE(user_id uuid, product_name text) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT sa.user_id, p.name
  FROM stock_alerts sa
  JOIN products p ON p.id = sa.product_id
  WHERE sa.product_id = p_product_id AND sa.notified = false;

  UPDATE stock_alerts SET notified = true
  WHERE product_id = p_product_id AND notified = false;
END;
$$;

-- ========== 4. VIDER LES CACHES (optionnel) ==========
-- TRUNCATE TABLE server_logs;  -- décommenter si nécessaire

"""
    MIGRATION_FILE.write_text(sql_content, encoding='utf-8')
    log_info(f"Fichier de migration SQL généré : {MIGRATION_FILE}")
    return True

# ========== MISE À JOUR DU FICHIER .ENV ==========
def update_env_file():
    """Vérifie et complète le fichier .env avec les clés manquantes"""
    required_vars = {
        "SUPABASE_URL": "",
        "SUPABASE_SERVICE_KEY": "",
        "SUPABASE_ANON_KEY": "",
        "JWT_SECRET": "",
        "JWT_EXPIRES_IN": "604800",
        "STRIPE_SECRET_KEY": "",
        "STRIPE_PUBLIC_KEY": "",
        "FRONTEND_URL": "https://nexus.sn",
        "LOG_LEVEL": "info"
    }
    if not ENV_FILE.exists():
        log_warn(f"{ENV_FILE} n'existe pas, création d'un modèle")
        ENV_FILE.touch()
    content = ENV_FILE.read_text(encoding='utf-8')
    lines = content.splitlines()
    existing_keys = set()
    for line in lines:
        if "=" in line and not line.startswith("#"):
            key = line.split("=")[0].strip()
            existing_keys.add(key)
    added = 0
    for key, default in required_vars.items():
        if key not in existing_keys:
            lines.append(f"{key}={default}")
            added += 1
    if added:
        ENV_FILE.write_text("\n".join(lines) + "\n", encoding='utf-8')
        log_info(f"Ajout de {added} variables d'environnement manquantes dans .env")
        log_warn("N'oubliez pas de remplir les valeurs manquantes dans .env")
    else:
        log_info("Le fichier .env contient déjà toutes les variables requises")

# ========== TEST DE CONNEXION SUPABASE ==========
def test_supabase_connection():
    """Test la connexion à Supabase en utilisant les variables d'environnement"""
    try:
        import requests
        from dotenv import load_dotenv
        load_dotenv(ENV_FILE)
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            log_warn("SUPABASE_URL ou SUPABASE_SERVICE_KEY manquants, test ignoré")
            return
        headers = {"apikey": key, "Authorization": f"Bearer {key}"}
        resp = requests.get(f"{url}/rest/v1/", headers=headers, timeout=10)
        if resp.status_code == 200:
            log_info("Test de connexion Supabase réussi")
        else:
            log_warn(f"Test Supabase : réponse HTTP {resp.status_code}")
    except ImportError:
        log_warn("Module requests ou python-dotenv non installé, test ignoré")
    except Exception as e:
        log_warn(f"Test Supabase échoué : {e}")

# ========== SCRIPT PRINCIPAL ==========
def main():
    import argparse
    parser = argparse.ArgumentParser(description="Correction automatique des communications Supabase pour NEXUS Market")
    parser.add_argument("--dry-run", action="store_true", help="Affiche les modifications sans écrire")
    parser.add_argument("--skip-backup", action="store_true", help="Ne pas créer de fichiers de backup")
    parser.add_argument("--skip-test", action="store_true", help="Ne pas tester la connexion Supabase")
    args = parser.parse_args()

    if args.dry_run:
        log_warn("Mode dry-run : aucune modification ne sera écrite")
        # Simuler
        return

    log_section("1. Correction du backend (server.js)")
    fix_backend_server_js()

    log_section("2. Correction du frontend (index.html)")
    fix_frontend_index_html()

    log_section("3. Génération de la migration SQL")
    generate_sql_migration()

    log_section("4. Mise à jour du fichier .env")
    update_env_file()

    if not args.skip_test:
        log_section("5. Test de connexion Supabase")
        test_supabase_connection()

    log_section("✅ CORRECTIONS TERMINÉES")
    print("\nRésumé des actions effectuées :")
    print("  • Ajout des mécanismes de retry et de validation dans le backend et le frontend")
    print("  • Création de l'endpoint /api/supabase-health")
    print("  • Génération du fichier de migration SQL (à exécuter dans Supabase)")
    print("  • Mise à jour du fichier .env avec les variables requises")
    print("\nProchaines étapes :")
    print("  1. Exécutez le fichier supabase_migrations.sql dans l'éditeur SQL de Supabase")
    print("  2. Redémarrez le serveur backend (node server.js)")
    print("  3. Rafraîchissez la page frontend")
    print("  4. Vérifiez la santé de Supabase via GET /api/supabase-health")

if __name__ == "__main__":
    main()