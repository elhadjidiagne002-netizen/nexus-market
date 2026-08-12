# NEXUS — Outils de prospection (Google Maps · Facebook · TikTok · Annuaires)

Des scrapers qui produisent des **CSV au format de l'importateur** NEXUS
(`Nom,Profession,Telephone,Ville,Region,Adresse,Latitude,Longitude,Source,Url`), prêts à
charger dans `nexus_importer.html` (onglet ①) **ou** le panneau admin **📇 Prospects**.

> ⚖️ **Éthique / légal** : ne cible que des **pages/comptes PROFESSIONNELS PUBLICS**
> (commerces) pour de la prospection B2B (nom, téléphone pro, adresse, GPS). Le scraping
> Facebook/TikTok passe par des **Actors Apify** (Apify exécute la collecte côté serveur et
> gère la conformité plateforme ; tu fournis ton token). Respecte les **CGU** de chaque
> plateforme et le **RGPD** (contact professionnel). Ne cible **pas** de comptes privés.

## 0. Prérequis
- **Node.js 18+** (`node -v`). Aucune dépendance pour Apify (Maps/Facebook/TikTok) ; `npm install` ne sert qu'au crawler d'annuaires Crawlee.
- Compte **[apify.com](https://apify.com)** (offre gratuite ≈ 5 $/mois de crédit) → *Settings → API tokens*.
- Vérifier le plumbing sans rien scraper : `npm run selftest`.

## Interface graphique (le plus simple) — `scraper-ui.html`
Ouvre **`scraper-ui.html`** dans ton navigateur (double-clic). Un seul écran, 4 onglets
(**Google Maps · Facebook · TikTok · Annuaire**) : colle ton token Apify, lance, **aperçu**
puis **⬇️ Télécharger le CSV**. Tout se passe dans le navigateur, le token reste en local.

## En ligne de commande

### 1. Google Maps (le plus fiable — GPS réel)
```bash
# PowerShell
$env:APIFY_TOKEN="apify_api_xxx"; node apify-maps.mjs --query "carreleur Dakar; carreleur Thiès" --out ../../prospection/carreleurs_maps.csv --max 60
```

### 2. Facebook (Pages publiques)
La découverte se fait sur facebook.com (cherche « garage Dakar »…), puis on **colle les URLs
des pages**. L'Actor renvoie nom, téléphone, adresse ; le téléphone est aussi **extrait de la
description** si besoin.
```bash
$env:APIFY_TOKEN="apify_api_xxx"; node apify-social.mjs --platform facebook `
  --urls "https://facebook.com/GarageX; https://facebook.com/GarageY" `
  --profession "Garage / Mécanicien" --out ../../prospection/fb_garages.csv
```

### 3. TikTok (mots-clés / hashtags / profils)
Le **téléphone est extrait de la bio** du créateur quand il y figure.
```bash
$env:APIFY_TOKEN="apify_api_xxx"; node apify-social.mjs --platform tiktok `
  --query "garage dakar; mecanicien senegal; #depannageauto" --max 50 `
  --profession "Garage / Mécanicien" --out ../../prospection/tiktok_garages.csv
```

Options communes : `--actor <id>` (surcharge l'Actor Apify), `--input-json '{...}'` (input Apify
complet), `--mobile-only` (mobiles 7X uniquement), `--source`, `--max`, `--profession`.

### 4. Annuaires publics (Crawlee — best-effort)
Pour un annuaire **statique**. Config de sélecteurs CSS (`configs/example-directory.json`) :
```bash
node crawlee-directory.mjs --config configs/mon-annuaire.json --out ../../prospection/mon_annuaire.csv
```

## Éviter les doublons entre prospections (registre global)
Un **registre** recense tout ce qui est déjà dans Supabase (comptes, prospects, produits,
lignes transport, annonces). Avant d'importer un nouveau CSV, filtre-le contre ce registre :
1. Dans Supabase → SQL Editor, lance `sql/2026_08_12_export_registry.sql` (crée la vue
   `export_registry`), puis exécute la requête finale et **Download CSV** → `tools/scraper/registry.csv`.
2. Filtre ton nouveau CSV :
   ```bash
   node dedupe-registry.mjs --registry registry.csv --in ../../prospection/nouveaux.csv --out ../../prospection/nouveaux_clean.csv
   ```
   Retire les lignes dont le **téléphone** (9 derniers chiffres) OU le **nom** normalisé
   existe déjà. Options : `--by phone|name|both`, `--name-col`, `--phone-col`.

## Après le scraping
1. Le CSV est **normalisé** (téléphones `+221 XX XXX XX XX`, mobiles triés en premier, doublons retirés).
2. Ouvre `nexus_importer.html` (onglet ①) **ou** le dashboard admin → **📇 Prospects**.
3. Choisis le **type de compte** (pro / vendeur / **dépanneur** / …) et importe/promeus.
   La colonne **Profession** est lue par ligne (ex. « Remorquage » → spécialité `tow_truck` pour un dépanneur).

## Fichiers
```
tools/scraper/
  scraper-ui.html         → interface unique (Maps · Facebook · TikTok · Annuaire)
  apify-maps.mjs          → Google Maps via Apify
  apify-social.mjs        → Facebook + TikTok via Apify (extraction tél. depuis la bio)
  crawlee-directory.mjs   → annuaires statiques via Crawlee
  lib/prospects-csv.mjs   → mapping + dédup + normalisation tél + extractPhone + priorité mobile
  selftest.mjs            → vérifie le plumbing (sans scraper)
```
