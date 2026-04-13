# NEXUS Market Sénégal — Guide de déploiement

## Architecture

```
index.html            ← Frontend React (fichier unique)
nexus_admin.html      ← Page de connexion admin (JWT ou démo)
nexus_reset.html      ← Réinitialisation données démo (protégée)
server.js             ← Backend Node.js/Express
schema.sql            ← Schéma PostgreSQL pour Supabase
.env                  ← Variables d'environnement (jamais committer)
```

Le frontend détecte automatiquement si `NEXUS_CONFIG.apiUrl` est configuré :
- **Configuré** → toutes les opérations passent par le backend (auth JWT, Stripe, Orange Money, Wave)
- **Non configuré** → mode démonstration localStorage (aucun vrai paiement)

---

## 1. Prérequis

- Node.js 18+
- Compte [Supabase](https://supabase.com) (gratuit)
- Compte [Stripe](https://stripe.com) (test ou prod)
- Optionnel : comptes Orange Money développeur, Wave API

---

## 2. Base de données (Supabase)

1. Créer un projet Supabase
2. Ouvrir **SQL Editor** et exécuter `schema.sql`
3. Dans **Storage** → créer un bucket public nommé `nexus-images`
4. Récupérer dans **Settings → API** :
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY` (⚠️ garder côté serveur uniquement)
   - `anon` key → pour le frontend si Supabase direct est utilisé

---

## 3. Configuration du serveur

```bash
cp .env.example .env
# Remplir toutes les valeurs dans .env
npm install
npm start          # production
npm run dev        # développement (nodemon)
```

### Variables obligatoires

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | URL de votre projet Supabase |
| `SUPABASE_SERVICE_KEY` | Clé service role Supabase (jamais exposée côté client) |
| `JWT_SECRET` | Chaîne aléatoire longue (`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`) |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (`sk_live_...` ou `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Secret webhook Stripe (`whsec_...`) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Config email (Gmail, SendGrid, Mailgun) |
| `FRONTEND_URL` | URL publique du frontend (ex: `https://nexus.sn`) |

### Variables optionnelles (Mobile Money)

| Variable | Description |
|----------|-------------|
| `ORANGE_MONEY_AUTH_HEADER` | `Basic BASE64(client_id:secret)` Orange Money |
| `ORANGE_MERCHANT_KEY` | Clé marchande Orange Money |
| `WAVE_API_KEY` | Clé API Wave Sénégal |

---

## 4. Configuration du frontend

Ouvrir `index.html` et remplir `NEXUS_CONFIG` (ligne ~975) :

```javascript
const NEXUS_CONFIG = {
  apiUrl: "https://api.nexus.sn",     // URL de votre serveur backend
  supabase: {
    url: "",       // optionnel si tout passe par le backend
    anonKey: ""
  },
  stripe: {
    publishableKey: "pk_live_..."     // clé publique Stripe
  },
  // emailjs: {} ← uniquement si email côté frontend (non recommandé)
};
```

---

## 5. Premier administrateur

Après avoir exécuté `schema.sql`, créer le compte admin via psql ou l'éditeur SQL Supabase :

```sql
INSERT INTO profiles (email, password_hash, name, role, avatar, status)
VALUES (
  'admin@nexus.sn',
  '$2b$12$HASH_BCRYPT_GENERE_PAR_NODE',  -- voir ci-dessous
  'Admin NEXUS',
  'admin',
  'AD',
  'active'
);
```

Générer le hash bcrypt :
```bash
node -e "require('bcrypt').hash('VotreMotDePasseAdmin', 12).then(console.log)"
```

---

## 6. Mobile Money — intégration réelle

### Orange Money Sénégal
1. S'inscrire sur [developer.orange.com](https://developer.orange.com/apis/orange-money-webpay-sn)
2. Créer une application, récupérer `client_id` et `client_secret`
3. Encoder en Base64 : `echo -n "client_id:client_secret" | base64`
4. Renseigner dans `.env` : `ORANGE_MONEY_AUTH_HEADER=Basic <base64>`
5. Renseigner `ORANGE_MERCHANT_KEY` fourni par Orange

### Wave
1. Contacter Wave Business : [wave.com/business](https://www.wave.com/fr/business/)
2. Récupérer la clé API de production
3. Renseigner `WAVE_API_KEY=wave_sn_prod_...`

En l'absence de ces clés, l'API répond avec `simulation: true` et le frontend bascule automatiquement en mode démo.

---

## 7. Stripe Webhooks

```bash
# Installer la CLI Stripe pour les tests locaux
stripe listen --forward-to localhost:3001/webhooks/stripe
```

En production, configurer le webhook dans le dashboard Stripe :
- URL : `https://api.nexus.sn/webhooks/stripe`
- Événements : `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.dispute.created`

---

## 8. HTTPS & Reverse proxy (production)

### Option A — Caddy (recommandé)
```
nexus.sn {
  root * /var/www/nexus
  file_server
  reverse_proxy /api/* localhost:3001
  reverse_proxy /webhooks/* localhost:3001
}
```

### Option B — nginx
```nginx
server {
  listen 443 ssl;
  server_name nexus.sn;
  # certificat SSL (Let's Encrypt via certbot)

  location / {
    root /var/www/nexus;
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://localhost:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  location /webhooks/ {
    proxy_pass http://localhost:3001;
  }
}
```

### Démarrage avec PM2
```bash
npm install -g pm2
pm2 start server.js --name nexus-api
pm2 startup && pm2 save
```

---

## 9. Supabase Storage (images produit)

Créer le bucket dans Supabase Dashboard → Storage :
- Nom : `nexus-images`
- Public : ✅ oui
- Taille max fichier : 5 MB

Le bucket sera utilisé automatiquement par `POST /api/upload`.

---

## 10. Sécurité avant lancement

- [ ] `nexus_reset.html` : changer le mot de passe gate (variable `GATE_HASH` dans le fichier)
- [ ] Supprimer `nexus_reset.html` du serveur web public (garder uniquement en local)
- [ ] `CORS` : vérifier que `FRONTEND_URL` est renseigné dans `.env` (pas `*`)
- [ ] JWT : utiliser une clé secrète de 256 bits minimum
- [ ] Stripe : passer en clés de production (`sk_live_...` / `pk_live_...`)
- [ ] Supabase RLS : vérifier les politiques (déjà configurées dans `schema.sql`)
- [ ] Mot de passe admin initial : changer immédiatement après création du compte
- [ ] Variables d'environnement : ne jamais committer `.env` (vérifier `.gitignore`)

---

## 11. Vérification de l'installation

```bash
# Health check
curl https://api.nexus.sn/api/health

# Réponse attendue
{
  "status": "OK",
  "service": "NEXUS Market API",
  "services": {
    "stripe": true,
    "supabase": true,
    "email": true
  }
}
```

---

## 12. Support

- Email : contact@nexus.sn
- SAV : sav@nexus.sn
- Litiges : litiges@nexus.sn
