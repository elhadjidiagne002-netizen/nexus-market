import os
import shutil

# Dossier racine du projet (à adapter si nécessaire)
project_root = "votre-projet"

# Dossier racine des fonctions (à adapter si nécessaire)
functions_root = "functions"

# Liste des fichiers et leurs destinations
files_mapping = {
    "stripe-create-intent.js": os.path.join(functions_root, "api", "payments", "stripe", "create-intent.js"),
    "payout-request.js": os.path.join(functions_root, "api", "payout", "request.js"),
    "health.js": os.path.join(project_root, "functions", "api", "health.js"),
    "payout-history.js": os.path.join(functions_root, "api", "payout", "history.js"),
    "paytech-ipn.js": os.path.join(project_root, "functions", "api", "payments", "paytech", "ipn.js"),
    "paytech-init.js": os.path.join(project_root, "functions", "api", "payments", "paytech", "init.js"),
    "paytech-verify-[orderId].js": os.path.join(project_root, "functions", "api", "payments", "paytech", "verify", "[orderId].js"),
    "stripe-webhook.js": os.path.join(functions_root, "api", "webhooks", "stripe.js"),
}

# Créer les dossiers de destination si ils n'existent pas
for dest_path in files_mapping.values():
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

# Déplacer ou copier chaque fichier
for src_file, dest_path in files_mapping.items():
    if os.path.exists(src_file):
        shutil.copy2(src_file, dest_path)
        print(f"Fichier '{src_file}' copié vers '{dest_path}'.")
    else:
        print(f"⚠️ Le fichier '{src_file}' n'existe pas dans le répertoire courant.")

print("Organisation des fichiers terminée.")