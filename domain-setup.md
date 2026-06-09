# Basculer NEXUS Market vers un domaine personnalisé (ex. `nexus.sn`)

Aujourd'hui le site est servi sur **`https://nexus-market-asb.pages.dev`** (Cloudflare Pages).
Ce guide explique comment passer à un domaine personnalisé **sans casser le SEO ni les liens**.

> 💡 La plupart des liens du code utilisent déjà la constante dynamique
> **`NEXUS_CONFIG.siteUrl`** (= l'origine réellement servie). Ils suivent donc
> automatiquement le nouveau domaine. Seules quelques **valeurs statiques**
> (balises SEO du `<head>`, `robots.txt`, `wrangler.toml`) doivent être basculées —
> et un script s'en charge.

---

## 1. Ajouter le domaine dans Cloudflare Pages
1. Cloudflare Dashboard → **Workers & Pages** → projet `nexus-market` → onglet **Custom domains**.
2. **Set up a custom domain** → saisir `nexus.sn` (et éventuellement `www.nexus.sn`).
3. Cloudflare fournit les enregistrements DNS à créer.

## 2. DNS côté NIC Sénégal (registraire `.sn`)
Chez votre registraire (NIC Sénégal / hébergeur du domaine `.sn`) :
- **Option A (recommandée)** : déléguer les **nameservers** à Cloudflare
  (Cloudflare les indique lors de l'ajout du domaine au compte). Gestion DNS simplifiée.
- **Option B** : garder le DNS actuel et créer un **CNAME**
  `nexus.sn` → `nexus-market-asb.pages.dev` (et `www` → idem). Pour un domaine apex
  (`nexus.sn` sans `www`), utiliser le **CNAME flattening** si supporté, sinon l'option A.

Attendre la propagation DNS (quelques minutes à 24 h) et la délivrance du certificat TLS
(automatique chez Cloudflare).

## 3. Basculer les valeurs statiques (1 commande)
```bash
node scripts/switch-domain.mjs nexus.sn
```
Le script remplace `nexus-market-asb.pages.dev` → `nexus.sn` dans :
- `public/index.html` — `og:url`, `og:image`, `twitter:image`, `canonical`,
  `hreflang`, données structurées (JSON-LD), domaine Plausible, fallbacks JS ;
- `public/robots.txt` — les 4 URLs de sitemaps ;
- `wrangler.toml` — `SITE_URL`, `FRONTEND_URL`, `BASE_URL`, `CONFIRM_EMAIL_URL`,
  `CORS_ORIGIN`, et les URLs de cron en commentaire.

Aperçu sans écrire : `node scripts/switch-domain.mjs nexus.sn --dry`
Revenir en arrière : `node scripts/switch-domain.mjs nexus-market-asb.pages.dev --from nexus.sn`

> ⚠️ Le script ne touche **pas** aux e-mails `@nexus.sn` ni au nom légal/marque.

## 4. Vérifier et déployer
```bash
git diff                      # contrôler les remplacements
git add -A && git commit -m "chore(domain): bascule vers nexus.sn"
git push origin main          # Cloudflare Pages redéploie automatiquement
```
Puis vérifier en direct :
- `https://nexus.sn/` se charge (cadenas TLS OK) ;
- `https://nexus.sn/ads.txt` renvoie la ligne AdSense ;
- code source : `<link rel="canonical" href="https://nexus.sn/">`.

## 5. Mettre à jour les services tiers
- **Google AdSense** → Sites → ajouter/vérifier `nexus.sn` (le `ads.txt` et la meta suivent).
- **Google Search Console** → ajouter la propriété `https://nexus.sn`, soumettre `sitemap_index.xml`.
- **Plausible Analytics** → renommer la propriété en `nexus.sn` (ou en créer une) puis,
  dans `index.html`, passer `PLAUSIBLE_ON` à `true` si l'analytics doit être activé.
- **Supabase Auth** → Authentication → URL Configuration → ajouter `https://nexus.sn`
  dans *Site URL* et *Redirect URLs* (confirmations e-mail / OAuth).
- **PayTech / Stripe** (si URLs de retour configurées) → mettre à jour les domaines autorisés.
- **Cloudflare Cron Triggers** → si les crons pointent une URL absolue, mettre à jour
  vers `https://nexus.sn/cron/...` (cf. commentaires de `wrangler.toml`).

## 6. (Optionnel) Rediriger l'ancien domaine
Pour éviter le contenu dupliqué, ajouter une **redirection 301**
`nexus-market-asb.pages.dev/*` → `https://nexus.sn/*` (Cloudflare Pages → Redirects,
ou une règle `_redirects`). Garder le canonical sur `nexus.sn`.

---

### Récapitulatif
| Élément | Suit le domaine automatiquement ? |
|---|---|
| Liens via `NEXUS_CONFIG.siteUrl` (parrainage, partages, suivi, feed Merchant…) | ✅ oui |
| `<head>` SEO, `robots.txt`, `wrangler.toml` | ⚙️ via `scripts/switch-domain.mjs` |
| E-mails `@nexus.sn`, nom légal/marque | — inchangés (volontaire) |
