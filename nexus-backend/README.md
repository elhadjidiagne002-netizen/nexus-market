# 🇸🇳 NEXUS Market — Guide de mise en service (débutant)

Suivez ces étapes **dans l'ordre**. Chaque étape est expliquée simplement.

---

## 📦 Ce que vous avez téléchargé

| Fichier | Rôle |
|---|---|
| `server.js` | Le serveur backend (v3.1.2 — 3 bugs corrigés) |
| `schema.sql` | La structure de la base de données (inchangé) |
| `rls_final.sql` | Les règles de sécurité Supabase (corrigées) |
| `.env` | Vos clés secrètes (à NE PAS partager) |
| `package.json` | Liste des librairies Node.js à installer |

---

## 🗄️ ÉTAPE 1 — Configurer la base de données Supabase

### 1.1 — Ouvrir l'éditeur SQL Supabase

1. Allez sur **https://supabase.com/dashboard**
2. Cliquez sur votre projet `pqcqbstbdujzaclsiosv`
3. Dans le menu gauche : **SQL Editor**
4. Cliquez sur **New query**

### 1.2 — Exécuter schema.sql

1. Ouvrez le fichier `schema.sql` avec un éditeur de texte (Notepad, VS Code…)
2. Sélectionnez tout le contenu (Ctrl+A)
3. Copiez (Ctrl+C)
4. Collez dans l'éditeur SQL Supabase (Ctrl+V)
5. Cliquez sur le bouton vert **Run** (ou F5)
6. Vous devez voir : **"Success. No rows returned"**

> ⚠️ Si vous voyez une erreur du type "already exists" : c'est normal si vous avez
> déjà exécuté ce fichier. Ignorez ces erreurs et continuez.

### 1.3 — Exécuter rls_final.sql

1. Cliquez sur **New query** pour une nouvelle fenêtre
2. Ouvrez `rls_final.sql`, copiez tout, collez dans Supabase
3. Cliquez **Run**
4. Vous devez voir : **"Success. No rows returned"**

### 1.4 — Vérifier que tout est bon

Dans Supabase Dashboard :
- Menu gauche → **Authentication** → **Policies**
- Chaque table doit afficher une icône verte et des politiques listées

### 1.5 — Activer le Realtime (notifications en temps réel)

1. Menu gauche → **Database** → **Replication**
2. Sous "Source", cliquez sur **0 tables**
3. Activez ces 3 tables en cochant : `notifications`, `messages`, `orders`
4. Cliquez **Save**

---

## 💻 ÉTAPE 2 — Installer Node.js (si pas encore fait)

1. Allez sur **https://nodejs.org**
2. Téléchargez la version **LTS** (bouton vert)
3. Installez normalement (suivez les étapes d'installation)
4. Vérifiez que ça marche :
   - Ouvrez un terminal (Invite de commandes sur Windows / Terminal sur Mac)
   - Tapez : `node --version`
   - Vous devez voir quelque chose comme : `v20.11.0`

---

## 📁 ÉTAPE 3 — Préparer votre dossier de projet

### 3.1 — Créer le dossier

Créez un dossier vide quelque part sur votre ordinateur.
Exemple : `C:\Projects\nexus-backend\` ou `~/nexus-backend/`

### 3.2 — Placer les fichiers

Copiez ces fichiers dans votre dossier :
```
nexus-backend/
  ├── server.js      ← le serveur corrigé
  ├── package.json   ← liste des dépendances
  └── .env           ← vos clés secrètes
```

> **Important :** Le fichier `.env` doit s'appeler exactement `.env`
> (avec le point devant, sans aucune autre extension).
> Sur Windows, il peut apparaître comme un fichier sans nom — c'est normal.

### 3.3 — Installer les dépendances

1. Ouvrez un terminal dans votre dossier `nexus-backend`
   - Windows : maintenez `Shift` + clic droit dans le dossier → "Ouvrir dans PowerShell"
   - Mac/Linux : `cd ~/nexus-backend`
2. Tapez cette commande et appuyez sur Entrée :
   ```
   npm install
   ```
3. Attendez que ça se termine (1-2 minutes). Vous verrez apparaître un dossier `node_modules`.

---

## 🚀 ÉTAPE 4 — Tester en local

### 4.1 — Démarrer le serveur

Dans votre terminal, tapez :
```
node server.js
```

Vous devez voir :
```
🚀 NEXUS Market API v3.1.2 démarré sur le port 3000
   Stripe   : ✅
   Supabase : ✅
   Email    : ✅
   Webhook  : ✅
   Health   : http://localhost:3000/api/health
```

### 4.2 — Vérifier que ça fonctionne

Ouvrez votre navigateur et allez à :
```
http://localhost:3000/api/health
```

Vous devez voir une réponse JSON avec `"status": "OK"`.

> Si vous voyez `"status": "DEGRADED"` : vérifiez vos variables dans `.env`.

### 4.3 — Arrêter le serveur

Pour arrêter : `Ctrl + C` dans le terminal.

---

## 🌐 ÉTAPE 5 — Déployer sur Render (hébergement gratuit)

### 5.1 — Créer un compte Render

1. Allez sur **https://render.com**
2. Cliquez **Get Started for Free**
3. Inscrivez-vous avec votre compte GitHub ou email

### 5.2 — Mettre votre code sur GitHub

Si vous n'avez pas encore GitHub :
1. Créez un compte sur **https://github.com**
2. Créez un nouveau dépôt (Repository) : bouton vert **New**
3. Nommez-le `nexus-backend`, cochez **Private** (important !)
4. Cliquez **Create repository**

Pour mettre vos fichiers dessus :
```bash
# Dans votre dossier nexus-backend :
git init
git add server.js package.json
# ⚠️  NE PAS ajouter .env à Git !
git commit -m "NEXUS Market backend v3.1.2"
git remote add origin https://github.com/VOTRE_NOM/nexus-backend.git
git push -u origin main
```

> **Important :** Ne jamais ajouter `.env` à Git. Créez un fichier `.gitignore`
> contenant une seule ligne : `.env`

### 5.3 — Déployer sur Render

1. Sur Render, cliquez **New +** → **Web Service**
2. Connectez votre compte GitHub
3. Sélectionnez votre repo `nexus-backend`
4. Remplissez :
   - **Name** : `nexus-market-api`
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
   - **Instance Type** : `Free`
5. Cliquez **Advanced** → **Add Environment Variable**
6. Ajoutez ces variables une par une (copiez depuis votre `.env`) :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | https://pqcqbstbdujzaclsiosv.supabase.co |
| `SUPABASE_SERVICE_KEY` | eyJ... (votre clé service) |
| `JWT_SECRET` | ba969674... (votre secret JWT) |
| `JWT_EXPIRES_IN` | 604800 |
| `STRIPE_PUBLIC_KEY` | pk_test_51TG... |
| `STRIPE_SECRET_KEY` | sk_test_51TG... |
| `STRIPE_WEBHOOK_SECRET` | whsec_Xlt4... |
| `SMTP_HOST` | smtp.gmail.com |
| `SMTP_PORT` | 587 |
| `SMTP_USER` | elhadjidiagne002@gmail.com |
| `SMTP_PASS` | lokaasorlefafaze |
| `SMTP_FROM` | NEXUS Market <elhadjidiagne002@gmail.com> |
| `ADMIN_EMAIL` | admin@nexus.sn |
| `FRONTEND_URL` | https://nexus-market-md360.vercel.app |
| `NODE_ENV` | production |
| `PORT` | 3000 |

7. Cliquez **Create Web Service**
8. Attendez 2-3 minutes. Render va afficher votre URL :
   ```
   https://nexus-market-api.onrender.com
   ```

### 5.4 — Vérifier le déploiement

Allez sur : `https://nexus-market-api.onrender.com/api/health`
Vous devez voir `"status": "OK"`.

---

## 🔗 ÉTAPE 6 — Connecter index.html au backend

Dans votre fichier `index.html`, trouvez la ligne :
```javascript
apiUrl: "",
```

Remplacez-la par :
```javascript
apiUrl: "https://nexus-market-api.onrender.com",
```

Sauvegardez et redéployez sur Vercel.

---

## 🔔 ÉTAPE 7 — Configurer le webhook Stripe (paiements)

Pour que les paiements soient confirmés automatiquement :

1. Allez sur **https://dashboard.stripe.com/webhooks**
2. Cliquez **Add endpoint**
3. URL : `https://nexus-market-api.onrender.com/api/webhooks/stripe`
4. Événements à écouter :
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. Cliquez **Add endpoint**
6. Copiez le **Signing secret** (commence par `whsec_`)
7. Mettez-le dans la variable `STRIPE_WEBHOOK_SECRET` sur Render

---

## ✅ Checklist finale

- [ ] `schema.sql` exécuté dans Supabase SQL Editor → succès
- [ ] `rls_final.sql` exécuté dans Supabase SQL Editor → succès
- [ ] Realtime activé sur `notifications`, `messages`, `orders`
- [ ] `npm install` réussi en local
- [ ] `node server.js` démarre sans erreur en local
- [ ] `http://localhost:3000/api/health` retourne `"status": "OK"`
- [ ] Code pushé sur GitHub (sans le fichier `.env` !)
- [ ] Déployé sur Render avec toutes les variables d'environnement
- [ ] `https://nexus-market-api.onrender.com/api/health` retourne `"status": "OK"`
- [ ] `index.html` mis à jour avec l'URL du backend
- [ ] Webhook Stripe configuré

---

## 🐛 Problèmes fréquents

### "Cannot find module 'express'"
→ Vous avez oublié de faire `npm install`. Exécutez-le.

### "Error: SUPABASE_SERVICE_KEY is not defined"
→ Votre fichier `.env` n'est pas au bon endroit ou mal nommé.
→ Il doit s'appeler `.env` dans le même dossier que `server.js`.

### Le serveur sur Render ne démarre pas
→ Vérifiez les logs dans Render Dashboard → votre service → **Logs**
→ Assurez-vous que toutes les variables d'environnement sont définies sur Render

### `"status": "DEGRADED"` dans le health check
→ Vérifiez `SUPABASE_URL` et `SUPABASE_SERVICE_KEY` dans vos variables

### Les emails ne partent pas
→ Vérifiez que `SMTP_PASS` est bien un **mot de passe d'application Gmail**
→ Allez sur : myaccount.google.com → Sécurité → Mots de passe des applications

---

## 📞 Résumé des URLs importantes

| Service | URL |
|---|---|
| Frontend (Vercel) | https://nexus-market-md360.vercel.app |
| Backend (Render) | https://nexus-market-api.onrender.com |
| Health check | https://nexus-market-api.onrender.com/api/health |
| Supabase Dashboard | https://supabase.com/dashboard/project/pqcqbstbdujzaclsiosv |
| Stripe Dashboard | https://dashboard.stripe.com |

---

*NEXUS Market Sénégal — Backend v3.1.2*
