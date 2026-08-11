# NEXUS — Outils de prospection (Apify Google Maps + Crawlee annuaires)

Deux scrapers qui produisent des **CSV au format de l'importateur** NEXUS
(`Nom,Ville,Region,Adresse,Telephone,Source,Latitude,Longitude`), prêts à charger dans
`nexus_importer.html` (onglet ①) **ou** le panneau admin **📇 Prospects**.

> ⚠️ **Éthique / légal** : on scrape uniquement des **annuaires publics** et **Google Maps**
> (données professionnelles : nom, téléphone, adresse, GPS). **Pas** de Facebook/Instagram
> (contraire à leurs CGU). Reste raisonnable sur les volumes.

## 0. Prérequis
- **Node.js 18+** (déjà présent : `node -v`).
- Installer les dépendances **une fois** :
  ```bash
  cd tools/scraper
  npm install
  ```
  *(Le script Google Maps n'a en réalité besoin d'aucune dépendance — `npm install` ne sert
  que pour le crawler d'annuaires Crawlee.)*

Vérifier que tout est en place (sans rien scraper) :
```bash
npm run selftest
```

## 1. Google Maps (recommandé — fiable, avec GPS réel)
Utilise l'Actor Apify **« Google Maps Scraper »** (`compass/crawler-google-places`).

**a) Crée un compte gratuit sur [apify.com](https://apify.com)** → *Settings → API tokens* → copie ton token.
Offre gratuite ≈ **5 $/mois** de crédit (≈ quelques milliers de lieux).

**b) Lance** (remplace le token) :
```bash
# Windows PowerShell
$env:APIFY_TOKEN="apify_api_xxx"; node apify-maps.mjs --query "carreleur Dakar; carreleur Thiès" --out ../../prospection/carreleurs_maps_senegal.csv --max 60

# Git Bash / Linux / Mac
APIFY_TOKEN=apify_api_xxx node apify-maps.mjs --query "carreleur Dakar" --out ../../prospection/carreleurs_maps_senegal.csv --max 60
```

Options :
| Option | Rôle |
|---|---|
| `--query "a; b; c"` | une ou plusieurs recherches Maps (séparées par `;`) |
| `--out <fichier>` | CSV de sortie (mets-le dans `prospection/`) |
| `--max 60` | nb max de lieux par recherche |
| `--mobile-only` | ne garder que les numéros **mobiles (7X)** |
| `--source "google-maps"` | valeur de la colonne `Source` |

## 2. Annuaires publics (Crawlee — best-effort)
Pour un annuaire **statique** (HTML sans JS). Piloté par un fichier de config de sélecteurs CSS.

**a) Copie et adapte** `configs/example-directory.json` (inspecte la page cible avec les DevTools
pour trouver les bons sélecteurs `.item`, `.name`, `.phone`, `.address`, `.next`).

**b) Lance** :
```bash
node crawlee-directory.mjs --config configs/mon-annuaire.json --out ../../prospection/mon_annuaire.csv
```

> Certains annuaires (GoAfrica, annuaire-senegal…) **masquent les téléphones** ou bloquent les
> robots (500). Dans ce cas → passe par **Google Maps** (§1), plus fiable.

## 3. Après le scraping
1. Le CSV est déjà **normalisé** (téléphones `+221 XX XXX XX XX`, mobiles triés en premier, doublons retirés).
2. Ouvre `nexus_importer.html` (onglet ①) **ou** le dashboard admin → **📇 Prospects**.
3. Choisis le **type de compte** (pro / vendeur / …) et importe/promeus.

## Fichiers
```
tools/scraper/
  apify-maps.mjs          → Google Maps via Apify (aucune dépendance)
  crawlee-directory.mjs   → annuaires statiques via Crawlee
  configs/example-directory.json
  lib/prospects-csv.mjs   → mapping + dédup + normalisation tél + priorité mobile
  selftest.mjs            → vérifie le plumbing (sans scraper)
```
