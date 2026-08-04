# Journal du projet NEXUS Market

Historique chronologique (le plus récent en haut) de ce qui a été fait, pourquoi,
et où en est chaque chantier. Complète `CLAUDE.md` (référence technique/pièges,
non chronologique). Mis à jour après chaque session de travail avec Claude.

---

## 2026-08-04 — Routage routier réel : OSRM + VROOM (squelette + doc)

**Constat** : tout le projet raisonnait à vol d'oiseau. Haversine côté frontend
(`DataService._haversineKm`, ETA figé à 22 km/h) et distance géodésique PostGIS
côté matching (`nearby_couriers`). À Dakar un coursier « à 800 m » peut être de
l'autre côté de la corniche = 15 min de route : le premier de la cascade d'offres
n'était pas le plus proche en temps réel. Même biais sur le devis de livraison
(`shipping-quote.js`, grille de zones statique).

**Fait** :
- `functions/api/_lib/routing.js` — client OSRM (`/route`, `/table`) + VROOM, en
  `fetch()` pur (compatible runtime Workers). Conversion `[lng, lat]` centralisée ici.
- `functions/api/courier/optimize.js` — `POST /api/courier/optimize`, admin ou appel
  interne, rate-limité 20/min/IP. Mode **classement** (`delivery_id`) : PostGIS
  pré-filtre, OSRM re-classe la liste courte par ETA routier jusqu'au retrait, et
  renvoie `crow_km` à côté de `road_km` pour rendre l'écart visible. Mode **groupé**
  (`delivery_ids`) : VROOM affecte N courses à M coursiers (shipments retrait→dépôt,
  capacité `max_per_courier`).
- `shipping-quote.js` — nouvelle source de prix `osrm` (base + prix/km sur distance
  routière) quand `from`/`to` sont fournis, intercalée entre l'API transporteur et
  la grille de zones.
- `docs/OSRM_VROOM.md` — déploiement Docker complet (extrait Geofabrik Sénégal,
  pipeline MLD, compose OSRM+VROOM, reverse proxy Caddy car aucun des deux services
  n'a d'authentification native), API, pièges.
- `.env.example` + `tests/unit/routing.test.js` (8 tests, repli sans service).

**Décisions structurantes** :
- **Rien n'est écrit en base par l'optimiseur** : il calcule et renvoie. L'attribution
  effective reste la cascade SQL / `admin_assign_delivery`, pour ne pas créer une
  seconde source de vérité de dispatch.
- **Dégradation totale** : sans `OSRM_BASE_URL` tout retombe sur Haversine × 1,35
  (facteur de détour urbain) ; sans `VROOM_BASE_URL` seul le mode groupé répond 503.
  Déployer le code sans déployer les services ne change donc rien au comportement actuel.
- Piège attrapé au passage : `Number(null) === 0` ferait passer un coursier de position
  NULL pour le point (0, 0) — filtré explicitement dans `isPoint()`, avec test dédié.

**État** : **déployé en prod** (commit `e30919c`, build Cloudflare vérifié —
`POST /api/courier/optimize` répond `{"error":"Token manquant"}` 401, la route existe).
`npm run test:unit` vert (35/35), lint 0 erreur. Documenté dans `docs/openapi.yaml` (v1.2.0).

**Suite (même jour)** : le premier consommateur est branché. Le bouton « Dispatch auto »
du panneau admin livraisons prenait `list[0]` de `nearbyCouriers`, soit le plus proche
**à vol d'oiseau** — exactement le biais que l'endpoint corrige. Il appelle maintenant
`/api/courier/optimize` et assigne le premier du classement **routier**, avec repli
intégral sur `nearbyCouriers` si l'appel échoue (non admin, réseau, service absent) :
ce bouton ne peut pas cesser de marcher. Le toast distingue la source (🛣️ OSRM vs 📐 vol
d'oiseau) et le classement complet (`crow_km` vs `road_km`) part en `console.info` —
c'est ce chiffre qui dira si automatiser la cascade vaut le coup. Commit `f9e3967`,
bundle renommé `app.5d267ad0fc` → `app.364f085be5`, vérifié live sur nexusmarket.sn
(`DataService.optimizeDelivery` = function).

**Reste à faire (hors périmètre code, décision/infra utilisateur)** : provisionner la VM
OSRM+VROOM (2 vCPU / 4 Go, procédure complète dans `docs/OSRM_VROOM.md`) puis renseigner
`OSRM_BASE_URL` / `VROOM_BASE_URL` (+ jetons du reverse proxy) dans les variables
Cloudflare Pages. **Tant qu'elles sont vides, le déploiement est inerte** : le
comportement du site est strictement identique à avant (Haversine partout).

---

## 2026-08-02 (octodecies) — Observabilité : alerte admin sur écart de réconciliation

**Constat** : frontend Sentry OK (charge le vrai SDK si DSN configuré) ; backend
sans alerte. Ajout de l'alerte OPS (« alerte sur écart » du #1).

**Fait** : `cron/reconcile-payments.js` — si le cron rattrape ≥1 paiement (un webhook
Stripe a été manqué : encaissé mais commande non marquée payée) OU rencontre des
erreurs, il envoie un **email d'alerte à l'admin** (`sendEmail` de `_lib/utils.js`,
Resend+Brevo, best-effort). Gate = `ADMIN_EMAIL` présent + clé email → aucun envoi
parasite si non configuré, aucune interruption de la réconciliation.

**Vérif** : `node --check` OK, eslint 0 erreur (warning `request` pré-existant),
28/28 tests. Sûr (best-effort, gated).

---

## 2026-08-02 (septdecies) — Journal payment_events branché dans les flux paiement (#1)

**Suite du #1 roadmap** : la migration `payment_events` était prête ; ici on BRANCHE
la journalisation (sans pouvoir appliquer la table — pas de token DB).

**Fait** :
- `functions/api/_lib/payment-log.js` : `logPaymentEvent(env, ev)` — insert
  best-effort dans `payment_events`. Toute erreur (table absente, réseau) avalée →
  **inerte tant que la migration n'est pas appliquée**, se remplit dès qu'elle l'est.
- Branché : `paydunya/init.js` (event `init`), `paydunya/ipn.js` (`ipn_paid`/
  `ipn_failed` + payload brut), `cron/reconcile-payments.js` (`reconciled_paid`/
  `_failed` = un webhook Stripe manqué, rattrapé = écart tracé).
- **NON touché** : handlers PayTech/Stripe live (pour zéro risque prod) → à étendre
  plus tard.

**Vérif** : `node --check` (4 fichiers) OK, eslint 0 erreur (warning `request`
pré-existant), 28/28 tests. Best-effort → aucun risque sur les paiements existants.

**Reste #1** : appliquer la migration, étendre aux handlers PayTech/Stripe, alerte
sur écart, réconciliation mobile money.

---

## 2026-08-02 (sexdecies) — Bouton « Exporter mes ventes (CSV) » dans le dashboard vendeur

**Demande** : rendre `sales-export` utilisable → bouton dans le dashboard vendeur.

**Fait (app.js compilé, `VendorDashboard`)** : bouton « Exporter (CSV) » ajouté à côté
de « Voir tout » dans le header de la carte « Commandes Récentes ». Handler :
`DataService.paymentFetch("/api/vendor/sales-export", {method:"GET"})` (JWT même
origine, réutilise la logique auth existante) → `res.blob()` → download via
`URL.createObjectURL` + `<a download>` → toast succès/erreur.
Cache-busting : bundle `app.47935795d8.js` → **`app.5d267ad0fc.js`** + ref index.html.

**Vérif locale** : `node --check` OK, app boote (0 erreur console), bouton présent
dans le bundle servi. Clic réel = à tester avec un login vendeur (dashboard gated).

---

## 2026-08-02 (quindecies) — Roadmap pro : attaque des 5 améliorations prioritaires

**Demande** : trouver des améliorations « niveau professionnel » et attaquer le top 5.
Analyse ancrée sur l'état réel (141 routes, 4 fichiers de test, réponses API 39
`{error}` vs 14 `{ok:false}`, incidents passés égress/IO Supabase).

**Feuille de route** : `docs/ROADMAP-PRO.md` (top 5 priorisé + reste, avec statut/effort).

**Livré cette session** :
- **#1 (préparé)** — `sql/2026_08_02_payment_events.sql` : journal IMMUABLE des
  événements paiement (audit financier, RLS service_role only). À APPLIQUER en base
  (bloqué : pas de token DB dispo ici). Ensuite : y journaliser Stripe/PayTech/PayDunya
  + `reconcile-payments.js` (aujourd'hui Stripe seul).
- **#2 (préparé)** — `scripts/audit-rls-grants.sql` : introspection RLS/GRANT
  (tables sans policy, RLS off, GRANTs table+COLONNE). À RUN avec le token. Cible en
  priorité `profiles.home_lat/home_lng` (ajouté 08-02 — risque de 403 GRANT colonne).
- **#3 (FAIT)** — helpers webhook purs extraits dans `functions/api/_lib/webhook-utils.js`
  (sha512hex/sha256hex/timingSafeEqual/parseNested) + **tests de contrat**
  `tests/unit/webhook-utils.test.js` (vecteurs NIST, comparaison constante, parsing
  form-encoded imbriqué PayDunya). paydunya/ipn.js refactoré pour les importer.
  **28/28 tests passent** (dans le gate precommit + CI).
- **#5 (1er livrable)** — `functions/api/vendor/sales-export.js` (GET /api/vendor/
  sales-export) : export CSV des ventes du vendeur connecté (auth, filtres from/to/
  status, EUR+FCFA, BOM UTF-8 Excel). Reste : factures PDF, analytics, alertes stock.
- **#4** — documenté dans la roadmap (migration réponses `response.js` PAR endpoint =
  risque de casse front → pas de bulk ; OpenAPI à compléter). Non exécuté ce tour.

**Bloqueurs** : #1 (créer la table) et #2 (audit) nécessitent le token Supabase
management (`SUPABASE_ACCESS_TOKEN`/`%TEMP%/sb-token.txt`), absent ici → livrés
« prêts à appliquer ». À exécuter par l'utilisateur.

**Reste des 5 (non fini, gros)** : #1 wiring journal + reconcile mobile money, #4
migration réponses, #5 facturation PDF. Suivi dans `docs/ROADMAP-PRO.md`.

---

## 2026-08-02 (quaterdecies) — Vendeur : position boutique sur carte (home_lat/home_lng)

**Demande** : target #3 — pin position boutique (les colonnes `profiles.home_lat/home_lng`
existaient mais n'étaient JAMAIS écrites). #2 (checkout) écarté : `orders` sans colonnes
lat/lng (migration requise) + redondant avec le pin coursier post-commande.

**Fait (app.js compilé, composant profil `handleSaveProfile`)** :
- Section carte « 📍 Position sur la carte (optionnel) » ajoutée au formulaire profil,
  après Ville/Pays : `NexusMap.pickLocation` (pin draggable + clic pour déplacer),
  initialisé sur `home_lat/home_lng` existants sinon Dakar. `onChange` → `setForm(prev =>
  {...prev, home_lat, home_lng})` (updater fonctionnel = pas de state obsolète).
- Sauvegarde : `home_lat/home_lng` ajoutés (conditionnellement, via Object.assign) aux
  DEUX corps de `handleSaveProfile` — update Supabase direct (chemin prod, apiUrl vide)
  ET PATCH /api/profiles/me (complétude). N'écrase pas avec null si non renseigné.
- Cache-busting : bundle `app.2051ad115d.js` → **`app.47935795d8.js`** + ref index.html.

**Vérif locale (static-py:5598, SW purgé)** : `node --check` OK, app boote (overlay 1519
él.), 0 erreur console, nouveau bundle référencé. pickLocation déjà prouvé (pin coursier).

**⚠️ À VÉRIFIER (non testable sans login vendeur en local)** :
1. Test UI réel : ouvrir le profil connecté → la carte s'affiche, glisser le pin,
   Enregistrer → `home_lat/home_lng` persistés en base.
2. **RLS/GRANT** : le rôle `authenticated` doit avoir UPDATE sur `profiles.home_lat/
   home_lng` (cf. piège mémoire orders-update-grant-403 : un GRANT colonne manquant →
   403 silencieux). Si la sauvegarde échoue en 403, ajouter le GRANT.
3. Ensuite : brancher une carte `NexusMap.nearby` qui lit ces positions pour les
   pros/boutiques (la valeur de #3 se concrétise là).

---

## 2026-08-02 (terdecies) — Coursier : pin draggable retrait/livraison (pickLocation câblé)

**Demande** : brancher le sélecteur d'adresse par pin (`pickLocation`, déjà codé mais
JAMAIS appelé — cf. audit undecies) sur le module Coursier (1er des 3 écrans choisis).

**Fait (index.html, module Coursier `CourierRequestModal`)** :
- 2 états `showPMap`/`showDMap` + 2 toggles opt-in « 🗺️ Ajuster le retrait/la livraison
  sur la carte » sous chaque sélecteur de quartier.
- Au clic : `NexusMap.pickLocation(el, {lat,lng,color,onChange})` monte une carte Leaflet
  avec pin **draggable** (vert retrait / rouge livraison), initialisé sur `coordsOf()`
  (quartier ou GPS déjà choisi). `onChange` → `setPGeo`/`setDGeo` → `coordsOf` renvoie le
  point ajusté → **le devis se recalcule** automatiquement (useEffect quote existant).
- Opt-in (pas affiché par défaut) → zéro flicker/état obsolète, aucune régression du flux
  existant (quartier + GPS inchangés).

**Vérif locale (static-py:5598, SW purgé)** : modal ouvert, toggle « Masquer la carte »,
carte Leaflet/OSM rendue (385×170, tuiles chargées) + **pin vert draggable** (screenshot),
toggle livraison présent. `check-inline-scripts` : seul le faux positif Fuse.

**Reste (2 autres cibles choisies)** : pin au checkout produit + à l'inscription vendeur.

---

## 2026-08-02 (duodecies) — Retrait de la fondation MapLibre (doublon de Leaflet)

**Décision** (utilisateur : garder les cartes Leaflet existantes + m'a laissé choisir
pour le doublon) : **retiré** la fondation MapLibre `window.nexusMap` (ajoutée en
64533f5) — elle faisait doublon avec la couche Leaflet mature (cf. entrée undecies).
Garder un helper carte dormant + une 2e techno = dette (risque qu'un futur dev le
branche par erreur). On reste sur **une seule couche carte : Leaflet**.

- `public/index.html` : bloc `window.nexusMap` + son commentaire supprimés.
- `public/_headers` : retrait des ajouts CSP spécifiques MapLibre (`connect-src
  tiles.openfreemap.org`, `worker-src 'self' blob:`) — vérifié : aucun autre code
  n'utilise de Web Worker ni openfreemap. **Conservé** `cdn.jsdelivr.net` en
  `style-src` (c'est le fix Leaflet de l'entrée undecies, indépendant).

**Suite prévue** (choix utilisateur) : auditer/brancher les cartes Leaflet existantes
sur les écrans qui en manquent (pickLocation au checkout ? nearby pour pros/location/
élevage ? covoiturage ?), plutôt que d'ajouter une techno.

---

## 2026-08-02 (undecies) — Régression CSP : CSS Leaflet bloqué (cartes cassées) — CORRIGÉ

**Découverte en préparant le « suivi coursier »** : le suivi coursier — et TOUTE une
couche cartographique — existe **déjà**, mature, via `window.NexusMap` (Leaflet, défini
index.html ~L9068) :
- `track(el, delivery)` : marqueurs retrait/dépôt/coursier + **abonnement Realtime**
  (postgres_changes UPDATE deliveries → position coursier live) + polling + ETA + partage.
- `nearby(el, point, couriers)` (coursiers proches + clustering), `fleet` (admin),
  `pickLocation` (pin d'adresse **draggable** — pour le checkout), `locateMe`, `openDirections`.
- Composant `DeliveryTrackingModal` (L6554) déjà branché.

**Régression introduite par la CSP enforce (commit c541e4a)** : Leaflet + markercluster
sont chargés depuis `cdn.jsdelivr.net`. Ma `style-src` autorisait cdnjs mais **PAS
jsdelivr** → le **CSS Leaflet/markercluster était bloqué** en enforce → cartes cassées
(les tuiles OSM en `<img>` passent via `img-src https:`, mais sans le CSS Leaflet la
carte est inutilisable). C'était exactement un des « flux dynamiques non testés » signalés
lors de l'activation de la CSP (le suivi coursier ne se charge qu'à l'ouverture du modal).

**Fix** : ajout de `https://cdn.jsdelivr.net` à `style-src` dans `public/_headers`.
Vérifié : tous les hôtes de CSS externes du projet (jsdelivr = leaflet + 2 markercluster ;
cdnjs = font-awesome + material symbols + maplibre) sont désormais dans `style-src`. Pas
d'autre CSS bloquée.

**Conséquence sur le plan MapLibre** : les 4 écrans géo demandés sont en réalité
**déjà couverts par la couche Leaflet existante** (suivi coursier ✓ realtime, adresse
checkout = `pickLocation` ✓, proximité = `nearby` ✓, admin fleet ✓). La fondation
MapLibre (commit 64533f5, `window.nexusMap`) fait **doublon** avec cette couche — elle
reste dormante (chargée seulement si `nexusMap.create()` est appelé, ce que rien ne fait).
Décision à prendre par l'utilisateur : (a) garder Leaflet (mature, corrigé) et laisser
nexusMap dormant/le retirer, ou (b) migrer NexusMap → MapLibre (gros chantier : track/
nearby/fleet/pickLocation, risque de régression). Recommandation : (a) — ne pas dupliquer.

**État** : CSP fix commité + poussé. À re-vérifier en prod : une carte Leaflet se charge
sous la CSP (CSS jsdelivr OK).

---

## 2026-08-02 (decies) — MapLibre : fondation (CSP + helper window.nexusMap)

**Demande** : MapLibre sur les 4 écrans géo (proximité location/élevage/pros, suivi
coursier temps réel, adresse checkout, covoiturage), tuiles OpenFreeMap. Livraison
INCRÉMENTALE : fondation d'abord (dont tout dépend), puis chaque écran vérifié.

**Paysage géo (investigué)** : `profiles` a `current_lat/current_lng/home_lat/home_lng` ;
RPC `nearby_couriers`/`nearby_couriers_offline`/`nearby_pros` → coursier + pros ont de
vraies coordonnées. Location/élevage/covoiturage = surtout niveau VILLE (géocodage à
prévoir pour ces écrans).

**Fait (fondation, index.html + _headers)** :
- `public/_headers` CSP : ajout `https://tiles.openfreemap.org` en `connect-src` (tuiles/
  style/glyphs récupérés en fetch) + `worker-src 'self' blob:` (MapLibre crée son worker
  depuis un blob: ; sans ça, bloqué par `default-src 'self'` en enforce).
- `index.html` : helper `window.nexusMap` — chargement PARESSEUX de MapLibre GL (CSS+JS
  cdnjs 4.7.1, injectés au 1er usage → aucun coût sur les pages sans carte). API :
  `create(el,{center,zoom})`, `addMarkers(map,[{lat,lng,title|html,onClick}],{color})`,
  `fit(map,points)`. Style OpenFreeMap `liberty`, centre Dakar par défaut.

**Vérif locale (static-py:5598, SW purgé)** : carte rendue (screenshot = fond
OpenFreeMap de Dakar avec rues/quartiers + marqueurs verts + attribution). cdnjs 4.7.1
JS/CSS = 200, style OpenFreeMap = 200. NB : les tuiles se chargent dans un Web Worker
→ invisibles à `performance.getEntriesByType('resource')` (0 en apparence, normal).
`check-inline-scripts` : seul le faux positif Fuse.

**À vérifier en prod** : rendu carte sous la CSP enforce (worker blob: + connect
openfreemap). **Écrans PAS encore construits** — à faire ensuite, 1 par 1, en
commençant par le coursier (données prêtes). Ce commit = fondation seule.

---

## 2026-08-02 (nonies) — Orama : recherche accueil (BM25 + tolérance fautes)

**Demande** : intégrer Orama (recommandé « gain immédiat »), périmètre = recherche
de l'accueil côté client. (MapLibre = étape suivante, « toutes les fonctionnalités
qui en ont besoin ».)

**Constat** : la recherche overlay (`renderSearch`/`nxpFuzzy` dans index.html)
utilisait déjà **Fuse.js** + repli substring. Orama ajoute BM25 (pertinence),
meilleure tolérance aux fautes, recherche par préfixe.

**Fait (index.html UNIQUEMENT → pas de app.js, pas de renommage de hash)** :
- `<head>` : chargement d'Orama en module ESM via `import('https://esm.sh/@orama/orama@3')`
  → `window.__ORAMA` (esm.sh déjà autorisé par la CSP script-src). Repli silencieux si KO.
- `renderSearch` refactoré : rendu **instantané** via nxpFuzzy (Fuse/substring), PUIS
  **affinage async** via Orama si dispo (garde « dernière requête gagne » via `_searchSeq`).
  HTML de rendu **strictement identique** (extrait dans `_renderSearchPanel`, `prodsOverride`).
  Helpers `oramaEnsureIndex` (index lazy depuis NXP_PRODS, reconstruit si le nb change) +
  `oramaSearch` (term + tolerance:1 + properties:['name']). Si Orama échoue → nxpFuzzy →
  substring : **la recherche ne casse jamais**.

**Vérif locale (static-py:5598, SW purgé)** : Orama chargé depuis esm.sh
(`window.__ORAMA`, exports create/insertMultiple/search OK) ; smoke test API v3 :
exact « samsung » OK, faute « samsng » → Samsung OK (tolérance), préfixe « ordina »
→ Ordinateur OK. `check-inline-scripts` : seul le faux positif pré-existant Fuse.
NB : catalogue vide en local (pas de Supabase) → test bout-en-bout des vrais produits
à faire en prod (NXP_PRODS peuplé).

**État** : commité + poussé. À re-vérifier en prod : Orama charge bien sous la CSP
enforce (script-src esm.sh). Prochaine étape : MapLibre.

---

## 2026-08-02 (octies) — Câblage front du fallback PayTech → PayDunya

**Demande** : câbler le fallback côté front (après le squelette backend PayDunya).

**Point clé** : ~8 sites d'appel à l'init PayTech dans `app.js` + 1 dans
`index.html`, mais **quasi tous passent par un helper partagé**
`DataService.paymentFetch(path, options)` → câblage en UN seul endroit possible.

**Fait (`public/assets/app.js`)** :
- `DataService.paymentFetch` (def ~L4554) : si `path` = `/api/payments/paytech/init`
  et que l'appel échoue (réseau/timeout OU réponse non-ok), retente le MÊME payload
  contre `/api/payments/paydunya/init`. Si PayDunya n'est pas configuré (503) ou
  injoignable → on renvoie la réponse/erreur PayTech d'origine → **comportement
  identique à aujourd'hui tant que PayDunya n'a pas de clés**. Extrait en `doFetch()`
  interne (garde le timeout 20s AbortController).
- Site publication STORY (~L12628) : converti de `fetch` brut vers
  `DataService.paymentFetch` → hérite du fallback + retire la gestion manuelle du token.
- Les autres sites (transport dans index.html, checkout commande, boost, abo pro,
  b2b, flash…) utilisent déjà `paymentFetch` → couverts automatiquement.

**Cache-busting** : bundle renommé `app.cabba864a4.js` → **`app.2051ad115d.js`**
(git mv + hash de contenu) + référence MAJ dans `index.html` (sinon Cloudflare/
navigateurs servent l'ancien bundle immutable — cf. mémoire app-bundle-hash).

**Vérif (local static-py:5598, SW purgé)** : `node --check` OK ; app boote et rend
l'overlay (1519 éléments), 0 erreur console ; fallback présent dans le bundle servi ;
nouveau bundle bien référencé. Le fallback lui-même (bascule réelle) n'est testable
qu'avec de vraies clés PayDunya en sandbox.

**État** : commité + poussé. Fallback ACTIF côté front mais INERTE tant que
PAYDUNYA_* absentes (PayDunya renvoie 503 → repli sur PayTech). Reste à faire
utilisateur : clés sandbox PayDunya + test bout-en-bout d'une bascule.

---

## 2026-08-02 (septies) — PayDunya en fallback de PayTech (squelette, dormant)

**Demande** : prototyper une intégration PayDunya (Wave/OM) en `fetch`/WebCrypto,
en **fallback** de PayTech (PayTech reste principal), après avoir vérifié que le
SDK `@tecafrik/africa-payment-sdk` **n'est PAS compatible Workers** (dépend de
`apisauce`→axios sans adaptateur fetch, et instancie Stripe en mode Node). On
réimplémente donc directement en fetch, le SDK servant de carte de référence.

**Contrat PayDunya (extrait du SDK)** : base `app.sandbox.paydunya.com/api/`
(test) / `app.paydunya.com/api/` (prod) ; 4 clés en en-tête (MASTER/PRIVATE/
PUBLIC/TOKEN) ; `POST v1/checkout-invoice/create` → `{response_code:'00', token}` ;
webhook vérifié par **SHA-512(master key)** comparé à `body.hash`.

**Créé (3 fichiers, DORMANTS tant que PAYDUNYA_* absentes → zéro impact prod)** :
- `functions/api/_lib/payment-fulfill.js` : logique de fulfillment PARTAGÉE (port
  fidèle de l'IPN PayTech : 7 kinds pro/boost/story/flash/api/b2b_priority/transport
  + commande, MAJ `orders` idempotente, notifs in-app + email/WA). ⚠️ PayTech
  garde sa copie inline (non modifié) → toute évolution à répercuter aux 2 endroits
  tant que PayTech n'est pas migré vers ce lib.
- `functions/api/payments/paydunya/init.js` : réutilise les MÊMES validateurs de
  montant que PayTech (`_lib/utils.js`), credential-gated (503 sans clés), crée la
  facture PayDunya en fetch, renvoie `redirect_url`. custom_data porte les mêmes
  identifiants que le custom_field PayTech.
- `functions/api/payments/paydunya/ipn.js` : vérif SHA-512 WebCrypto (compare
  temps constant), parsing défensif (form-encoded imbriqué `data[...]` OU JSON),
  délègue à `fulfillPayment`. 401 si `PAYDUNYA_MASTER_KEY` absente.

**Vérif** : `node --check` + ESLint OK sur les 3 fichiers. Non déployable-actif sans
clés → sûr à committer.

**RESTE À FAIRE côté utilisateur (non fait — hors de mon périmètre sûr)** :
1. Créer un compte PayDunya + récupérer les 4 clés (sandbox d'abord), les mettre en
   variables Cloudflare Pages.
2. **Tester en sandbox** : le format exact de l'URL de checkout hébergée
   (`sandbox-checkout/invoice/{token}` ?) et du corps du webhook sont marqués
   « à confirmer » dans le code — à valider avec un vrai paiement test.
3. Déclarer l'IPN `https://nexusmarket.sn/api/payments/paydunya/ipn` dans le
   dashboard PayDunya.
4. **Câbler le fallback front** : sur échec de `/api/payments/paytech/init`,
   rappeler `/api/payments/paydunya/init` (même payload) puis rediriger. (Volontairement
   PAS fait : touche le flux paiement live, à faire une fois la sandbox validée.)

**Env** : `.env.example` documenté (PAYDUNYA_MASTER_KEY/PRIVATE_KEY/PUBLIC_KEY/
TOKEN/STORE_NAME/ENV).

---

## 2026-08-02 (sexies) — Fix régression : menu « Widgets » bas-gauche affiché en permanence

**Symptôme signalé** : le menu de widgets flottants bas-gauche (Coursier, NEXUS Pro,
Élevage, Location, Covoiturage, Troc, Chat, Assistant IA, Ventes Flash…) s'affichait
en permanence au lieu de s'ouvrir à la demande via le bouton « Widgets ».

**Cause racine** : régression du passage au Tailwind statique (commit bfd14be). Le
`#nxp-widgetStack` est caché par défaut via la classe Tailwind `.hidden`
(`display:none`) et affiché par le toggle JS (inchangé, correct). MAIS index.html
contient un bloc d'**utilitaires legacy inline** (`<style>` ~ligne 1839 : `.flex`,
`.gap-1`, `.mb-1`… mêmes NOMS que des utilitaires Tailwind, valeurs parfois
différentes). L'ancien CDN `cdn.tailwindcss.com` injectait son CSS au runtime APRÈS
ces styles inline → Tailwind gagnait la cascade → `.hidden` battait `.flex`. Mon
`<link>` statique était placé TÔT (ligne 55, avant le bloc inline) → le `.flex` inline
(`display:flex`, plus loin dans la cascade) écrasait `.hidden` → stack affiché en
permanence (confirmé : `getComputedStyle` = `flex` malgré la classe `hidden` présente,
2 règles `.flex` détectées dont une inline).

**Fix** : déplacé le `<link rel="stylesheet" href="/assets/tailwind.<hash>.css">` de la
ligne 55 vers **juste avant `</head>`** (tout dernier stylesheet du head) → réplique
l'injection tardive du CDN → Tailwind regagne la cascade. Commentaires ajoutés aux
deux emplacements pour que ça ne soit pas « optimisé » à la remontée par erreur.

**Portée** : ce n'était pas que les widgets — TOUT écart entre valeurs Tailwind et
utilitaires legacy homonymes (`.gap-1` 0.25 vs 0.5rem, `.mb-1`…) était inversé par
rapport à l'état pré-changement ; le fix restaure l'ensemble à l'identique de l'ère CDN
(les dashboards vivaient déjà avec Tailwind gagnant).

**Vérif locale (static-py:5598, SW purgé)** : `#nxp-widgetStack` display=`none` par
défaut ; témoin `flex hidden`→`none` (`.hidden` regagne) ; toggle testé : clic→`flex`
(icône `close`), reclic→`none`. Comportement à la demande restauré. Tailwind confirmé
dernier stylesheet du head.

**Leçon (CLAUDE.md-worthy)** : sur ce repo, un CSS Tailwind statique DOIT être chargé
en dernier dans le `<head>` à cause des utilitaires legacy inline homonymes. Ne jamais
remonter le `<link>`.

**État** : commité + poussé. Re-vérif prod après déploiement Cloudflare recommandée.

---

## 2026-08-02 (quinquies) — CSP passée en mode bloquant (enforce)

**Demande** : activer la Content-Security-Policy en enforce (elle était en
Report-Only depuis le 2026-07-02).

**Risque** : en enforce, toute ressource non listée est BLOQUÉE (scripts, styles,
fetch, iframes). Le site charge de NOMBREUX tiers (Stripe, Mux, GA, AdSense,
Cloudinary, EmailJS, Facebook, Google auth, Sentry) → risque réel de casser
paiement/vidéo/login/upload, flux non testables ici (pas de comptes sandbox).

**Méthode de dérisquage** :
1. Relevé de TOUTES les ressources chargées par l'accueil (prod, via
   `performance.getEntriesByType('resource')`) croisé avec chaque directive CSP.
   → Une seule origine externe manquait : **www.google-analytics.com** (fetch GA,
   absent de connect-src).
2. `form-action 'self'` — vérifié que PayTech redirige via `window.location.href`
   (navigation top-level, PAS un POST de formulaire) → non bloqué. Idem pas de
   `<form action>` externe (SPA = fetch + preventDefault).
3. Nouvelle policy = **surensemble strict** de l'ancienne (rien retiré, tout ce qui
   passait passe encore) + ajout des endpoints runtime que le grep statique ne
   voyait pas : GA (`www.google-analytics.com`, `*.google-analytics.com`,
   `*.analytics.google.com`, `stats.g.doubleclick.net`), HLS Mux
   (`stream.mux.com` en connect, pas que media-src) + `*.litix.io`, EmailJS
   (`api.emailjs.com`), OAuth Google (`accounts.google.com`, `oauth2.googleapis.com`),
   télémétrie Stripe (`m.stripe.com`, `m.stripe.network`), 3DS Stripe
   (`hooks.stripe.com` en frame-src).

**Vérif locale (wrangler pages dev :8788, qui applique `_headers`)** :
- Header servi bien en `Content-Security-Policy:` (enforce), pas report-only.
- Enforce prouvé actif : fetch vers un hôte non listé → violation `connect-src`
  captée + fetch échoué.
- Cœur du SPA sous enforce : `esm.sh` (importmap, vital), Supabase, Stripe se
  chargent sans blocage.

**⚠️ NON testable ici, à tester par l'utilisateur juste après déploiement** :
checkout Stripe (carte), checkout PayTech/mobile money, login Google, lecture
vidéo stories (Mux/HLS), upload photo (Cloudinary). Si l'un casse → regarder la
console (« Refused to … » / violation CSP) pour l'origine bloquée, l'ajouter à la
directive correspondante dans `public/_headers`.

**Rollback immédiat** : renommer `Content-Security-Policy` →
`Content-Security-Policy-Report-Only` dans `public/_headers` + redéploy → CSP
redevient inoffensive (journalise sans bloquer).

**État** : commité + poussé. `unsafe-inline`/`unsafe-eval` conservés (front
monolithique) → protection XSS partielle mais restriction des sources externes
effective. Piste future : nonces/hashes pour retirer unsafe-inline (gros chantier).

---

## 2026-08-02 (quater) — Tailwind statique (remplace le CDN runtime) — perf

**Demande** : sortir Tailwind du CDN runtime (`cdn.tailwindcss.com`, déconseillé en
prod, compilait le CSS en JS côté navigateur à chaque chargement) vers un CSS
pré-compilé statique. Chantier signalé comme « à risque » dans l'audit.

**Investigation (dérisquage préalable)** : vérifié qu'AUCUNE classe Tailwind n'est
construite dynamiquement (`'bg-'+x` ou template `\`bg-${x}\``) dans index.html ni
app.js → le scanner de contenu peut tout capter. Découverte : le bundle React
`app.js` utilise son PROPRE design system (`btn`, `form-input`, `card`… définis
dans un CSS séparé, non-Tailwind) — Tailwind ne servait en pratique que l'overlay
d'accueil statique `#nx-proto-overlay` + quelques utilitaires. app.js ne lit nulle
part `tailwind.config` (le moteur CDN en était le seul consommateur).

**Fait** :
- `tailwind.config.js` (racine) : reproduit EXACTEMENT l'ancien config inline
  (preflight OFF, darkMode class, couleurs MD3, spacing/radius custom, plugins
  forms + container-queries). content = `./public/index.html` + `./public/assets/app.*.js`.
- `styles/tailwind.css` : entrée (@tailwind base/components/utilities).
- `package.json` : script `build:css` + devDeps (tailwindcss@3, forms,
  container-queries). package-lock.json **resynchronisé** (`npm install`) — sinon
  `npm ci` de Cloudflare aurait échoué (piège lock désync).
- `public/assets/tailwind.cd189cc7de.css` (34 Ko minifié) : CSS généré, committé
  (même logique que app.<hash>.js, cache immutable). ⚠️ NON câblé dans le build
  Cloudflare (`npm run build`=static, devDeps ignorées en prod) — on committe la
  sortie.
- `public/index.html` : `<script cdn.tailwindcss.com>` + objet `tailwind.config`
  inline (mort, personne ne le lisait) → remplacés par `<link>` vers le CSS statique.

**Vérification (locale, serveur static-py:5598, SW désenregistré + caches vidés)** :
- Test de parité DOM→CSS : sur 486 tokens de classe du DOM rendu, **0 classe
  Tailwind manquante** (2 faux positifs initiaux : `text-md` n'existe pas en
  Tailwind = toujours inerte ; `shadow-[…rgba…]` était en fait présente, mon
  `CSS.escape` ne matchait pas l'échappement Tailwind des valeurs arbitraires).
- Styles calculés OK : bg-primary=#006d40, text-on-surface-variant=#3e4a41,
  rounded-xl=16px, p-md=16px, ombre nav mobile arbitraire appliquée.
- Screenshot accueil : rendu correct (pills, couleurs, ombres, typo), aucun FOUC.
- Config reproductible validée : régénération depuis la racine = CSS **identique
  octet pour octet** au fichier committé.

**Piège vérif** : le test de parité DOM→CSS DOIT utiliser `CSS.escape()` MAIS même
lui ne reproduit pas exactement l'échappement Tailwind des valeurs arbitraires
complexes (`shadow-[0_-2px_10px_rgba(0,0,0,.06)]`) → confirmer les « manquantes »
par style calculé (probe getComputedStyle) avant de conclure à une régression.

**Réserve** : `npm install` a signalé 2 vulnérabilités « high » dans des deps
transitives du build Tailwind — **devDependencies only** (build-time, jamais
servies aux utilisateurs ; la sortie est un CSS statique). Non bloquant.

**État** : commité + poussé (voir commit suivant). Non encore re-vérifié après
redéploiement Cloudflare — prochaine étape : confirmer en prod que
`/assets/tailwind.cd189cc7de.css` répond 200 et que l'accueil est bien stylé
sans le CDN.

---

## 2026-08-02 (ter) — Améliorations SEO post-audit (llms.txt, meta desc, lazy-loading)

**Demande** : appliquer les changements pour faire monter la note d'audit globale.

**Fait (changements de code sûrs, à fort ROI)** :
- `public/llms.txt` : 3 slugs catégorie en 404 corrigés (`mode-vetements`→`mode`,
  `maison-deco`→`maison`, `beaute-sante`→`beaute`). Slugs canoniques confirmés
  dans `functions/_lib/categories.js` + vérif HTTP live (200/404). Les liens
  `?view=catalog`/`?register=vendor` laissés (200, points d'entrée SPA réels).
- `functions/annonce/[id].js` : fallback meta description quand la description
  vendeur est trop courte (<50 car., ex. « fluide ») → enrichie du contexte
  catégorie · ville · prix. (Le fallback existant de `seo.js:73` ne se
  déclenchait que si la description était totalement vide.)
- `public/index.html` : `loading="lazy"` ajouté sur 4 images de contenu dynamique
  (modale quick-view cachée, cartes flash, cartes produit grille, vignette
  recherche). Les 4 logos en en-tête laissés en eager (petits, above-the-fold).

**Volontairement PAS fait (risque en prod, à traiter séparément)** :
- **Défer React/ReactDOM** : des `<script>` inline entre les deux utilisent
  `React` en synchrone → tout casserait. L'audit avait surestimé ce point ;
  l'accueil a DÉJÀ `preconnect` vers les CDN (index.html:37-42), polices +
  Font Awesome en non-bloquant (`media=print onload`), et la plupart des
  scripts secondaires déjà `defer`. Gain restant faible vs risque élevé.
- **Sortir Tailwind du CDN runtime** (`cdn.tailwindcss.com`) : vrai gain perf
  mais gros chantier de build (scan des classes générées dans les template
  strings JS) avec risque de FOUC/classes manquantes. À planifier à part.
- **Activer la CSP** (report-only → enforce) : risque de casser des ressources
  si la policy est incomplète ; nécessite d'analyser les rapports de violation
  d'abord.

**Piège vérif** : `scripts/check-inline-scripts.mjs` remonte une erreur
pré-existante (ligne 224, « Unexpected identifier 'Fuse' ») = faux positif sur la
syntaxe `import` du module Fuse via importmap, PAS causée par ces edits (confirmé
en re-testant la version committée via git stash). Mes edits ne rajoutent aucune
erreur.

**État** : commité + poussé (voir commit suivant). `node --check`/eslint OK.
Non encore re-vérifié en prod après redéploiement Cloudflare.

---

## 2026-08-02 (bis) — Audit SEO complet nexusmarket.sn : catalogue produit invisible pour Google

**Demande** : audit SEO complet du site via le skill `seo-audit`.

**Incident d'orchestration** : les 8 agents spécialisés (technical/content/schema/
sitemap/geo/ecommerce/sxo/backlinks) ont été lancés avec `isolation: "worktree"`
par erreur (pertinent pour des agents qui modifient du code, pas pour de
l'analyse en lecture seule). Résultat : leurs écritures dans
`nexusmarket.sn-audit/findings/` ont atterri dans des copies isolées du repo,
7 des 8 worktrees ont été auto-nettoyés en fin d'exécution → **~450k tokens de
travail perdus, irrécupérables**. Leçon retenue : ne plus utiliser
`isolation: "worktree"` pour des agents de recherche/audit pur ; le laisser
réservé aux agents qui commitent du code.

**Découverte fortuite** : ce dossier `nexusmarket.sn-audit/` contenait déjà un
audit complet du **2026-07-02** (score 71/100, correctifs déjà appliqués et
vérifiés — `_headers` déplacé dans `public/`, sitemap.xml nettoyé de 28 URLs
legacy, schema shippingDetails/returnPolicy ajouté, 12 `alt` manquants
corrigés). Cet audit a été préservé (archivé en `*-2026-07-02.md/json`) avant
que le nouveau rapport ne soit écrit par-dessus.

**Après accord utilisateur** (rédiger le rapport moi-même plutôt que relancer
8 agents), audit refait en solo via `curl` + lecture directe du code.

**Finding critique découvert** (le plus important de la session) :
`functions/sitemap-listings.xml.js` interroge la table `products` (le vrai
catalogue, avec le schema le plus riche du site — Product/Offer/
shippingDetails/MerchantReturnPolicy, confirmé en prod) mais avec un filtre
PostgREST `id=not.like.a0000001*` — probablement invalide sur `products.id`
qui est une colonne **UUID** (l'opérateur `like` est un opérateur texte).
`sbGet()` avale silencieusement toute erreur HTTP (`catch { return []; }`) →
le sitemap dynamique en prod ne contient que 3 URLs (2 `/annonce/` + 1 `/pro/`),
**zéro `/produit/`**, alors que `llms.txt` du site revendique "des milliers de
produits". Autrement dit : la quasi-totalité du catalogue, avec le meilleur
schema SEO du site, n'est probablement jamais soumise à l'indexation Google.
**Non vérifié en base** (pas de token Supabase management dispo dans cet
environnement) — à confirmer avec
`node scripts/db-query.mjs "SELECT count(*) FROM products WHERE active"`.

**Autres findings** : `robots.txt` toujours contradictoire pour les bots IA
(signalé en juillet, non corrigé — fix dashboard Cloudflare, pas code) ;
scripts synchrones bloquants sur l'accueil (React/ReactDOM/Tailwind CDN
runtime, ce dernier explicitement déconseillé en prod par Tailwind) ; CSP
toujours en `report-only` ; lien mort dans `llms.txt`
(`/categorie/mode-vetements` → 404, vrai slug `/categorie/mode`) ; meta
descriptions parfois quasi vides sur les fiches annonce à description courte
(ex. `"fluide"`).

**État final** : rapport complet dans `nexusmarket.sn-audit/FULL-AUDIT-REPORT.md`
+ `ACTION-PLAN.md` + `audit-data.json` (score global 62/100, en recul par
rapport à juillet — nouveau problème détecté, pas une régression des acquis).
SXO, backlinks et images **non réévalués** cette passe (recherche SERP live,
Common Crawl, captures d'écran nécessiteraient de relancer les agents
spécialisés, correctement cette fois, sans isolation worktree).

**Fix appliqué et déployé dans la foulée** (même session) : filtre
`id=not.like.a0000001*` retiré de la requête PostgREST dans
`functions/sitemap-listings.xml.js` (déplacé côté JS, `isDemoId`) ;
`sbGet()` loggue désormais les échecs HTTP au lieu de les avaler en silence.
`node --check`/ESLint/tests unitaires OK, commit `0ad3c43` poussé sur `main`.
**Non encore re-vérifié en prod après redéploiement Cloudflare** (build
asynchrone) — prochaine session : re-fetcher `https://nexusmarket.sn/sitemap-listings.xml`
et confirmer que les URLs `/produit/` apparaissent.

---

## 2026-08-02 — Réduction de la pollution de contexte Claude Code (git status + permissions)

**Demande** : identifier et implémenter les mécanismes d'économie de tokens pour
Claude Code, côté projet.

**Constat** : `git status` (injecté à chaque tour de conversation) remontait **387
entrées**, dont **363 provenant d'un dépôt `claude-seo-main` cloné par erreur à la
racine du projet** (confirmé doublon : le vrai clone de travail vit dans
`Downloads/claude-seo-main`, séparé). S'y ajoutaient des dumps DB (`db_cluster-*.backup`
8,8 Mo + .gz), un export CSV de contacts (PII), un zip de certificat domaine — tous
untracked, jamais nettoyés.

**Implémenté** :
- `.gitignore` : ajout de `claude-seo-main/`, `db_cluster-*.backup*`,
  `contacts-nexus-*.csv`, `google.com!*.zip` → `git status` passe de 387 à 22 lignes.
  Non destructif (fichiers conservés sur disque, juste sortis du suivi git).
- `.claude/settings.json` (nouveau, partagé/committé) : liste blanche de permissions
  pour les commandes read-only récurrentes identifiées dans les transcripts
  (`node --check *`, `git -C <projet> status/log/diff/branch *`, `tasklist *`) —
  réduit les prompts de permission répétés.

**État final** : appliqué et vérifié. **En attente côté utilisateur** (non scriptable
depuis ce terminal, nécessite une session interactive) : désactiver les plugins/MCP
inutilisés (marketing/sales/finance/SEO) qui gonflent le system prompt de chaque
session sans rapport avec ce projet, via `/plugin` ou `/mcp`. Restent aussi en attente
de décision utilisateur : les 13 suppressions non commitées dans `publicite/`
(commit ou restauration ?) et le sort du dossier `claude-seo-main/` sur disque
(supprimer ou déplacer hors du repo ?).

---

## 2026-08-01 — Alertes WhatsApp admin sur les événements actionnables

**Demande** : l'admin notifié par WhatsApp « après chaque action » pour se connecter
si une action est requise. Recadré (auto-notif sur CHAQUE clic = spam + quota Green
API) vers les événements **actionnables**. Périmètre choisi par l'utilisateur : les 3
admin existants + inscription coursier + chaque nouvelle commande.

**Constat** : l'infra existait déjà à 90 %. 3 événements admin (`admin_new_vendor`,
`admin_payout_request`, `admin_new_dispute`) étaient câblés (déclencheurs frontend +
serveur) et envoyaient email + WhatsApp via `sendEventNotification`, mais leur
`whatsapp_enabled` était **false** → WhatsApp bloqué par le gating. Les déclencheurs :
vendeur (app.js:14231), litige (app.js:5452), retrait (payout-request.js, serveur).

**Bloqueur trouvé** : AUCUN numéro admin configuré — les 2 profils `role='admin'` ont
`phone=null`, et `env.ADMIN_PHONE` (Cloudflare) est incertain/non défini. Sans numéro,
rien ne part en WhatsApp (l'email part, `ADMIN_EMAIL=nx@nexusmarket.sn` défini).

**Implémenté** :
- DB (`admin_whatsapp_notifications`) : `whatsapp_enabled=true` sur les 3 existants +
  2 nouveaux événements `admin_new_courier` / `admin_new_order` (email+WA activés).
- `notify.js` : gabarits email + WhatsApp des 2 nouveaux + helper **`resolveAdminContact(env)`**
  = `env.ADMIN_PHONE` sinon **téléphone du profil admin** (ADMIN_USER_ID prioritaire,
  sinon 1er `role='admin'` avec téléphone). → l'admin gère son numéro in-app, sans
  toucher à Cloudflare.
- `notify-admin.js` : `admin_new_courier`/`admin_new_order` ajoutés à ALLOWED ; usage
  de `resolveAdminContact`.
- `payout-request.js` : usage de `resolveAdminContact` (repli profil).
- `order-email.js` : déclenche `admin_new_order` à CHAQUE commande (endpoint appelé
  par le trigger DB `trg_order_confirm_email`, tous modes de paiement/invité).
- Bundle : après l'insertion de candidature coursier (`register`, app.js:22521),
  `EmailService.notifyAdmin('admin_new_courier', …)`.

⚠️ **PRÉREQUIS pour recevoir les WhatsApp** : renseigner le numéro admin, soit
`ADMIN_PHONE` dans Cloudflare (E.164, +221…), soit le champ `phone` du profil admin
(via `resolveAdminContact`). Tant qu'aucun n'est fait, seuls les EMAILS partent.

**Réglage in-app (choix utilisateur : « depuis le tableau de bord admin »)** : ajout
d'une carte **« 📲 Numéro d'alerte admin »** en tête du Centre de notifications admin
(`NotifAdminPhoneCard`). Enregistre `profiles.phone` de l'admin connecté (normalisation
E.164 sénégalaise), lu ensuite par `resolveAdminContact`. L'admin définit donc son
numéro sans toucher à Cloudflare ; vide = WhatsApp admin désactivé (emails maintenus).

Bundle renommé `app.66579bad69.js` → `app.a22582ecaa.js`. Non vérifié en live (envoi
réel WhatsApp dépend du numéro saisi + d'un vrai événement) — syntaxe + migration OK.

## 2026-08-01 — Égress Supabase qui remonte : fuites média dans le bundle React

**Symptôme** : l'utilisateur voit l'égress Supabase remonter alors que « ça doit
tourner sur Cloudflare ». Diagnostic : R2 ne couvre QUE le stockage média ; l'égress
inclut aussi REST/Realtime/Auth. Investigation (logs storage/realtime + tailles).

**Écartés** : produits minuscules (184 o de moyenne, zéro base64 inline) ; Realtime
intermittent (« no connected users » régulier, se coupe) ; storage média = poignée
d'accès sur 18h. Rien qui explique une montée régulière… sauf les accès **directs**
`/object/public/nexus-stories/*.mp4` + `/nexus-images/*` avec UA navigateur = média
tiré en DIRECT de supabase.co, contournant les proxies Cloudflare.

**Cause racine — 3 fuites, toutes dans le rendu (l'overlay statique était corrigé,
pas le reste)** :
1. **Lecteur de stories** (`app.js`, `v.src = cur.video_url`) : jouait le MP4
   complet (~12 Mo) depuis supabase.co à CHAQUE lecture.
2. **Aperçu vidéo des cartes stories** (`app.js`, `<video src=s.video_url
   preload=metadata>`) : **chaque visite de l'accueil** préchargeait les métadonnées
   de ~6 MP4 bruts depuis Supabase → probablement le plus gros levier de la montée.
3. **Cartes Ventes Flash** (`index.html`, `flashCardHtml`) : image produit en
   `src=image_url` brut, alors que `sbCard` appliquait déjà la réécriture `/img/`.

**Fix** : (1)+(2) → `/stories/media/:id` (proxy Cloudflare + R2, cache 1 an) au lieu
de `video_url` ; (3) → même regex `→ /img/` que `sbCard`. Repli sur l'URL brute
seulement si l'id manque. La page SEO story (`og:video`) et les vidéos d'avis
(URL externes type YouTube) étaient déjà OK.

**Vérifié en local** (SW purgé) : accueil = **0 média brut supabase.co** (110 images,
2 vidéos) — tout via `/img/` et `/stories/media/`. Zéro erreur console. Bundle
renommé `app.c55b8bb98b.js` → `app.66579bad69.js`.

⚠️ Règle (déjà en mémoire, re-confirmée) : JAMAIS de `video_url`/`image_url`
supabase.co brut dans le rendu — toujours `/stories/media/:id` (vidéo) ou `/img/`
(image). Vérifier LES DEUX chemins de rendu : overlay statique ET bundle React.

## 2026-08-01 — Ouverture du panier animée (Framer Motion, sans conflit CSS)

Demande : animer l'ouverture du panier (`CartGrouped`), après la bannière sociale.

**Découverte** : le panier **s'animait déjà** — `.modal-overlay` a un `@keyframes
fadeIn` (0.2s) et `.modal` un `slideUp` (0.25s) définis en CSS. Un premier essai
naïf (poser des `motion.div` par-dessus) a créé un **conflit** : une animation CSS
écrase le style inline → FM masqué (transform mesuré 24px = le CSS, pas mes 16px FM).

**Résolu** : l'overlay + le panneau deviennent `motion.div` UNIQUEMENT quand FM est
chargé, et dans ce cas on neutralise l'anim CSS via `style:{animation:'none'}` inline
→ FM prend le relais (fondu + montée 16px + scale 0.97→1, easing [.16,1,.3,1],
cohérent avec la bannière). Si FM absent (esm.sh bloqué, ou pas encore chargé au
1er open) → éléments `div` normaux, AUCUNE prop d'anim, l'anim CSS existante
(fadeIn/slideUp) sert de **fallback** — le panier s'anime dans tous les cas.
`prefers-reduced-motion` : opacity seule. Animation à l'ENTRÉE ; fermeture immédiate
(comme avant). Chargement FM à la demande via le `useFramerMotion` partagé.

Réutilise l'infra du commit précédent (import map + shims + loader) — zéro nouvelle
dépendance, zéro changement CSP.

**Vérifié en local** (SW purgé) : FM préchargé → ouverture pilotée FM (mid-anim
`matrix(0.97,0,0,0.97,0,16)`, `animationName:none` sur overlay ET panneau, settle
opacity 1 / transform none) ; FM absent → fallback CSS `slideUp` actif ; bouton
fermer interactif ; zéro erreur console. ⚠️ Sur le tout 1er open avant que FM soit
en cache, léger remount `div`→`motion.div` (CSS puis FM) — cosmétique, accepté pour
garder le chargement à la demande (pas de FM préchargé pour tous). Bundle renommé
`app.f7d6af7bd8.js` → `app.c55b8bb98b.js`.

## 2026-08-01 — Framer Motion câblé : bannière de connexion sociale animée

Suite du commit précédent (shims dormants) : import map câblé + 1ère animation.

**Import map** (`index.html`, placé AVANT le 1er `<script type="module">` = Fuse,
sinon ignoré) : `react`/`react-dom`/`react/jsx-runtime`/`react-dom/client` →
shims `public/vendor/*-shim.mjs`. Vérifié dans le vrai contexte du site :
`import('react')` renvoie bien l'instance globale (`=== window.React` : true).

**Hébergement Framer Motion — décision** : esm.sh ne produit PAS de fichier ESM
vraiment autonome pour framer-motion (bundle-deps / `*`-prefix / `?bundle` testés :
tous laissent ~90 sous-imports `framer-motion/dist/...` + `motion-dom`/`motion-utils`).
Le vendorer localement = mirrorer ~90 fichiers ou introduire un bundler (build step,
hors périmètre). → Chargement **runtime depuis esm.sh** (`import('https://esm.sh/
framer-motion@11?external=react,react-dom')`), déjà validé. `?external=react,react-dom`
= la lib émet `import "react"` en bare → capté par l'import map → même React. Risque
égress ≠ média (chargé 1×, caché navigateur longtemps, + fallback dur). `esm.sh`
ajouté à `script-src` (CSP report-only).

**`NexusSocialPrompt`** (bundle) réécrit :
- Loader FM **à la demande** (`useFramerMotion(active)`) : ne charge la lib QUE pour
  un visiteur non connecté qui va voir la bannière — jamais pour un connecté.
- `AnimatePresence` + `motion.div` : anime l'ENTRÉE (opacity/y/scale) ET la SORTIE
  (l'apport réel vs CSS — le fondu de sortie au dismiss).
- Respect `prefers-reduced-motion` : opacity seule, sans translation/scale.
- **Fallback CSS** (keyframe `nxSocialIn` injectée) si esm.sh échoue/bloqué → la
  bannière apparaît quand même, entrée animée, sortie immédiate. Aucune dépendance
  dure à esm.sh.

**Vérifié en local** (SW purgé, onglet au 1er plan pour éviter le throttling rAF) :
import map OK (React unique), FM chargé, bannière à 4s **animée par FM** (transform
inline présent, pas le fallback), settled opacity 1, 4 boutons ; **sortie animée**
confirmée (à 140ms après clic Fermer : encore présente, opacity 0.14 → retrait à
~500ms) ; flag dismiss mémorisé ; keyframe fallback injectée ; zéro erreur console.
Bundle renommé `app.6624f30b26.js` → `app.f7d6af7bd8.js`.

## 2026-08-01 — Shims React ESM pour Framer Motion (infra dormante)

**Contexte** : évaluation des technos à utiliser pour la suite. Verdict = rester
sur **React 18 + Tailwind** (déjà en place, CDN, zéro build) ; TypeScript / Vite /
Express / MySQL / Rust / Redis écartés (chacun impliquerait une réécriture
d'architecture ou fait doublon avec Postgres/Workers). **Framer Motion** = le seul
ajout possible sans casser le modèle « zéro build ».

**Piège vérifié en conditions réelles** (pas supposé) : Framer Motion importé en
ESM (`esm.sh`) charge sa PROPRE copie de React → 2 instances coexistantes → hooks
cassés (« Invalid hook call »). Reproduit : `React ESM === global` renvoyait
`false`. Solution testée et validée : un **import map** qui redirige `react`,
`react/jsx-runtime`, `react-dom`, `react-dom/client` vers 4 shims qui réexportent
le `window.React`/`window.ReactDOM` déjà chargés en UMD → une seule instance
(`=== global` devient `true`). Animation `opacity 0→1` menée à terme en preview.

Deux pièges annexes trouvés au passage : (1) `?external=react,react-dom,react/jsx-runtime`
sur esm.sh renvoie 404 (le `/` casse le parsing de la query) → n'externaliser que
`react,react-dom` ; (2) le shim doit exporter `useInsertionEffect` (+ `useTransition`,
`useDeferredValue`) sinon Framer Motion échoue à l'import.

**Livré ce commit** : les 4 fichiers `public/vendor/*-shim.mjs` UNIQUEMENT.
⚠️ **Infra dormante** : rien ne les utilise tant que l'import map n'est pas ajouté
à `index.html` ET qu'aucun composant n'importe Framer Motion. Aucun impact sur le
site en l'état. Câblage (import map + 1er composant animé) à faire quand un besoin
d'animation précis est identifié — pas encore décidé.

## 2026-07-31 — Admin : proposer une course à un coursier hors ligne (+ WhatsApp)

**Besoin** : pouvoir remettre un coursier en ligne même s'il ne l'est pas, lui
proposer une course et le relancer par WhatsApp pour qu'il se connecte et accepte.

**Ce qui manquait** : l'admin n'avait que deux options sur une course sans coursier :
- `admin_assign_delivery` → attribution **forcée** (`status='accepted'`) au nom d'un
  coursier qui n'a rien accepté et n'est peut-être pas devant son téléphone ;
- « 🤖 Auto » → ne voit que les coursiers **en ligne** (`nearby_couriers` exige
  `is_available=true` + position < 30 min) → ne trouve rien en heures creuses.

L'entre-deux — *proposer* à un coursier précis, hors ligne — n'existait pas.

**Nouveau RPC `admin_offer_delivery(delivery, courier, minutes=15, force_online=true)`**
(`sql/2026_07_31_admin_offer_delivery.sql`, appliqué en prod) :
1. remet le coursier en ligne (`couriers.is_available=true`,
   `profiles.courier_status='available'`) ;
2. crée une **offre ciblée** dans `delivery_offers` (`pending`, `seq=-5` pour
   passer devant la cascade) à **expiration longue** (15 min vs 40 s) ;
3. neutralise les autres offres en cours sur cette course ;
4. repasse la course en `searching`.

La course **n'est pas attribuée** : `accept_delivery` exige justement une offre
`pending` au nom du coursier — c'est ce qui lui permet d'accepter lui-même depuis
son tableau de bord (`getCourierOffers` la voit, même s'il se croit hors ligne).
Passé le délai, `dispatch_tick` expire l'offre et la cascade normale reprend.

**Front** : `DataService.adminOfferDelivery` + sélecteur « 📲 Proposer… » dans
l'onglet Courses du panneau Livraison admin, listant **tous** les coursiers actifs
(🟢 en ligne / ⚫ hors ligne, en ligne d'abord). Envoie ensuite le WhatsApp
(rémunération, trajet, heure limite, lien) + une notification in-app.

**Pièges rencontrés (tous corrigés)** :
- `deliveries` n'a **pas** de `pickup_city`/`delivery_city` — ces noms n'existent
  que dans le mapping JS de l'admin. Vraies colonnes : `pickup_label`/`pickup_zone`,
  `dropoff_label`/`dropoff_zone`. Détecté par le test, sinon erreur à l'exécution.
- `courier_status` canonique = **`available`** (pas `online`) : le panneau admin
  filtre dessus.
- `notification_events.whatsapp_enabled` a pour défaut **false** → la ligne
  `courier_offer` est insérée avec `true` explicite, sinon l'envoi serait
  silencieusement ignoré (gating serveur ET client).
- `REVOKE ... FROM PUBLIC` **ne suffit pas** : les privilèges par défaut Supabase
  accordent EXECUTE à `anon` **directement**. Il faut `REVOKE ... FROM anon`.
- `location_updated_at` volontairement **non** rafraîchi : le faire simulerait une
  position fraîche que le coursier n'a pas envoyée, et `nearby_couriers` le
  proposerait à des clients sur une position périmée.

**Vérifié** : appels réels du RPC dans des blocs `DO` terminés par une exception
(donc intégralement annulés — aucune écriture en prod). Cas nominal : coursier
hors ligne → `is_available` f→t, `courier_status=available`, 1 offre `pending`
`seq=-5`, course `searching`, payload WhatsApp complet. Garde-fous : non-admin →
« admin requis » ; coursier suspendu → refus ; course déjà attribuée → refus.
Anon via PostgREST → 401 « permission denied ». Base contrôlée après coup : zéro
résidu. Bundle renommé `app.28bb9e68e7.js` → `app.898c5ddef1.js`.

⚠️ **Non vérifié visuellement** : le sélecteur lui-même (le panneau exige une
session admin). Syntaxe, montage React et absence d'erreur console contrôlés.

## 2026-07-31 — GA4 ne collectait quasiment rien (consentement en sessionStorage)

**État des lieux demandé sur Brevo / HubSpot / GA4** :
- **Brevo** : clé configurée (`/api/health` → `brevo:true`), mais utilisé **uniquement
  comme secours e-mail** derrière Resend (`notify.js`). Aucun usage CRM (pas de
  synchro contacts, pas de listes, pas de scénarios).
- **HubSpot** : **totalement absent** du projet.
- **GA4** : ID `G-2N3MPBQ6Z8` en dur dans le bundle, mais **ne collectait presque rien**.

**Cause** : `loadGtag()` exige `cookie_consent === 'all'` (correct RGPD), or le
consentement était stocké en **`sessionStorage`** → **perdu à chaque nouvelle
session**. Conséquences : la bannière se réaffichait à chaque visite, et GA4 (comme
le pixel Facebook) n'était jamais chargé avant le clic — donc quasiment jamais.
Vérifié en prod : sur une visite fraîche, `gtag` = `undefined`, aucun script Google.

**Correctif** : `cookie_consent` devient la **seule** clé persistée en `localStorage`
(`nexus_cookie_consent`), avec repli de lecture sur l'ancienne clé sessionStorage
pour ne pas re-solliciter les sessions déjà ouvertes. Écriture dans les deux ;
suppression dans les deux (retirer son consentement doit vraiment l'effacer). La
règle « pas de localStorage pour les données métier » reste valable — un
consentement n'en est pas une, et le RGPD suppose au contraire qu'on le mémorise.

⚠️ **Bundle renommé** `app.2a3fd760ad.js` → **`app.28bb9e68e7.js`** (+ référence
dans `index.html`) : `/assets/*` est servi `immutable` 1 an, éditer en place ne
livre rien.

**Vérifié en local** (SW purgé, 3 scénarios) : (1) visite vierge → bannière affichée,
`gtag` absent ; (2) clic « Tout accepter » → `localStorage` écrit, gtag chargé,
script GTM injecté ; (3) **nouvelle session** (sessionStorage vidé) → consentement
relu, **gtag chargé sans aucun clic**, `dataLayer` alimenté, bannière non réaffichée.
Contrôle inverse : avec `'essential'`, ni GA4 ni pixel FB — le garde-fou tient.

## 2026-08-01 — Bouton Android : vrai fichier .apk téléchargé (pas un guide)

**Demande** : le bouton « Télécharger l'appli » doit livrer le **vrai fichier**
à un visiteur déjà prêt à installer — pas une invite/un guide d'abord.

**Trouvé** : un APK réel existait déjà, non versionné, à la racine du repo
(`NEXUS Market - Google Play package/NEXUS Market.apk`, 1,3 Mo — package TWA
signé, généré via PWABuilder). Le dossier contient aussi **`signing.keystore`
+ le mot de passe en clair** (`signing-key-info.txt`) : la clé privée de
signature de l'app. **Copié uniquement l'`.apk`** vers `public/downloads/
nexus-market.apk` — jamais le dossier entier, jamais le keystore. `.gitignore`
excluait déjà `NEXUS*/` (anticipé par une session précédente) ; le nouveau
chemin `public/downloads/` n'est pas concerné, vérifié avec `git check-ignore`.

Découverte au passage : `public/.well-known/assetlinks.json` (Digital Asset
Links, vérification TWA — supprime la barre d'adresse Chrome une fois l'app
installée, rendu 100% natif) était **déjà publié et fonctionnel** en prod
avec 2 entrées TWA. Ma première copie l'aurait écrasé en perdant la 2e entrée
(`dev.pages.nexus_market_asb.twa`) — repéré via `git diff` avant commit,
restauré (`git checkout --`), aucune modification nécessaire sur ce fichier.

**iOS** : question posée à l'utilisateur — aucun fichier `.ipa` n'existe dans
le projet, et même s'il existait, iOS ne sait pas installer un `.ipa` brut
téléchargé depuis Safari (contrairement à Android) sans TestFlight (compte
Apple Developer 99$/an + Mac/Xcode + review Apple) ou certificat entreprise
(hors ToS Apple pour distribution publique, risque de révocation). Réponse :
garder le guide PWA existant (« Sur l'écran d'accueil »), seule solution
100% sous contrôle sans infrastructure Apple.

**Implémenté** (`public/index.html`) : `nexusDownloadApp('android')` déclenche
maintenant un vrai `<a download>` vers `/downloads/nexus-market.apk`
(remplace l'ancienne logique PWA-install-first + guide de repli, devenue
inutile puisque le fichier réel est maintenant l'action principale). Un guide
s'affiche **après** le téléchargement (pas avant) pour l'étape « Sources
inconnues » — avertissement Android réel et non contournable pour toute app
hors Play Store, pas une erreur du site. Libellés des 4 boutons (footer
statique + overlay) : « Télécharger l'APK / pour Android » (honnête, reflète
l'action réelle) ; iOS inchangé (« Installer sur / iPhone · iPad »).

`public/_headers` : nouvelle règle `/downloads/*` — `Content-Type:
application/vnd.android.package-archive`, `Content-Disposition: attachment`,
cache modéré (1h, PAS immutable : le fichier sera remplacé à chaque nouvelle
version sans changer de nom). `public/sw.js` : `/downloads/` ajouté à
`BYPASS_PATHS` (pas d'intérêt à mettre en cache SW un binaire de 1,3 Mo).

**Vérifié en local** : SHA256 de la copie = SHA256 de l'original (octet pour
octet) ; `fetch HEAD` sur `/downloads/nexus-market.apk` → 200, taille exacte
1 347 317 octets ; clic réel sur le bouton Android → vrai lien de
téléchargement déclenché (`href` + `download` corrects) + guide post-
téléchargement avec les 3 bonnes étapes ; bouton iOS non affecté ; zéro
erreur console. En-têtes HTTP (Content-Type, Content-Disposition) non
vérifiables en local (serveur Python de dev, ne lit pas `_headers` — à
confirmer une fois en prod).

## 2026-07-31 — Boutons « Télécharger l'appli » : guide de repli + libellés honnêtes

**Demande** : utiliser les boutons existants pour proposer le téléchargement de
l'app directement depuis le site, sans passer par les stores (absents).

**État constaté** : la solution PWA (« Add to Home Screen ») avait déjà été
câblée lors d'une session précédente (`window.nexusDownloadApp` → guide iOS 3
étapes, ou `window.nexusInstall()` sur Android/Chrome via `beforeinstallprompt`).
Vérifié fonctionnel côté infra : manifest 200, 4 icônes 200, `sw.js` 200 avec
handler `fetch` (critère d'installabilité requis). **Mais** :
1. Sur Android/Bureau, quand `beforeinstallprompt` ne s'était pas déclenché
   (heuristique d'engagement Chrome non déterministe — pas garanti au 1er
   chargement) ou n'existe pas du tout (**Firefox**), le clic tombait sur un
   simple toast **sans issue** : aucun moyen d'installer.
2. Les boutons affichaient « Disponible sur App Store / Google Play » avec le
   style pilule noire des vrais badges de store — trompeur, alors que les apps
   n'y sont pas.

**Corrigé** (`public/index.html`, script + 4 boutons dans les 2 footers) :
- Guide manuel de repli (`showManualInstallGuide`), même format que le guide
  iOS existant, avec détection UA à 4 branches : Firefox Android (menu ⋮ →
  Installer), Chrome/Edge Android (menu ⋮ → Installer l'application), Chrome/
  Edge Bureau (icône ⊕ dans la barre d'adresse), autres navigateurs (invite à
  changer de navigateur — Safari desktop ne supporte pas l'installation PWA).
- Libellés relabellés : « Disponible sur / App Store » → « Installer sur /
  iPhone · iPad », idem Android → « Installer sur / Android · Bureau ». Style
  visuel (pilules noires) conservé — familier, reste crédible.

**Vérifié en local** : clic bouton Android → modal repli Chrome/Bureau (2
étapes, texte correct) ; fermeture du modal fonctionnelle ; clic bouton iOS →
guide 3 étapes inchangé ; les 4 boutons (footer statique + overlay) affichent
les nouveaux libellés ; zéro erreur console. Pas de changement dans `app.js` →
pas de renommage de bundle nécessaire.

## 2026-07-31 — Refonte accueil : barre catégorie, réassurance retirée, FB + social login

Quatre changements demandés sur `public/index.html` / `public/assets/app.js`.

1. **Barre `#nxp-catBar`** (sous le header) : remplacée. Elle listait des
   raccourcis de services (Coursier Express, On Demand, NEXUS Pro, Élevage,
   Location, Covoiturage, Troc, Chat, Assistant IA, Ventes Flash, Déposer une
   annonce) — désormais un filtre **catégorie/type de produit** (Tous, Électronique,
   Mode, Maison & Déco, Beauté & Santé, Alimentation, Informatique, Produits
   locaux, Auto & Moto, Ventes Flash), chaque clic appelant `nxpShowAll({cat})`
   via la table `ROUTES` déjà existante (`CAT()`). Ajouté 2 entrées manquantes à
   `ROUTES` (`informatique`, `produits locaux`). Les raccourcis retirés restent
   accessibles via les widgets bas-gauche et le tiroir hamburger — rien n'a
   disparu, juste déplacé de cette barre précise.
2. **Bande réassurance** (Protection acheteur / Wave·OM / Livraison / Vendeurs
   vérifiés) : retirée. Elle existait en **double** — une fois dans l'overlay
   statique (`index.html`), une fois dans le composant React `HomeStoriesRow`-
   adjacent du bundle (`app.js`, section « BANDE RÉASSURANCE (refonte) ») —
   supprimée aux deux endroits, sinon elle restait visible pour les utilisateurs
   dont la vue n'utilise pas l'overlay.
3. **Aperçu Facebook dans « Suivez-nous »** : ajout d'une iframe Page Plugin
   officielle (`facebook.com/plugins/page.php`) en plus du lien existant.
   `facebook.com` était déjà autorisé en `frame-src` CSP — aucune modif CSP
   nécessaire. `loading="lazy"`, dégradation propre si bloqué par un adblocker
   (le lien texte reste la voie de repli).
4. **Connexion sociale proactive** : `GoogleOneTapProvider` (prompt natif Google
   coin haut-droit) était **entièrement codé mais jamais monté** dans l'arbre
   React — oubli confirmé, le `clientId` Google est bien configuré dans
   `NEXUS_CONFIG.google.clientId`. Monté à la racine, gardé par `!currentUser2`.
   Comme One Tap ne couvre QUE Google (pas d'équivalent Facebook), ajout d'un
   second composant **`NexusSocialPrompt`** : bannière bas-droite, apparaît après
   4 s pour un visiteur non connecté, propose Google **et** Facebook (réutilise
   `GoogleSignInButton`/`FacebookSignInButton` déjà existants, zéro logique
   d'auth dupliquée), fermeture mémorisée en sessionStorage (revient à la
   session suivante).

**Vérifié en local** (SW purgé) : nouvelle barre catégorie rend 10 items
corrects ; bande réassurance absente **partout** dans le DOM (les 2 occurrences
avaient été trouvées puis retirées) ; bannière sociale apparaît après le délai
avec les 2 boutons + fermeture fonctionnelle (testé clic réel, disparition
confirmée après re-render) ; zéro erreur console. Bundle renommé
`app.898c5ddef1.js` → `app.6624f30b26.js`.

## 2026-07-31 — Boutons « Ajouter au panier » affichant du code source (Fuse.js)

**Symptôme** : sur l'accueil, chaque carte produit affichait, à la place du bouton,
le **code source minifié d'une fonction** en majuscules
(`FUNCTION E(N){VAR I=ARGUMENTS.LENGTH>1…`).

**Cause racine** : le bundle **UMD de Fuse.js v7.0.0** commence par
`var e,t;e=this,t=function(){…}`. Chargé en script **classique** (`defer`), ce
`var t` de premier niveau devient `window.t` et **écrase l'alias i18n** posé par
`app.js` (`window.t = t`, i18n.js:2585). Comme `defer` s'exécute *après* `app.js`,
Fuse gagnait toujours. Les cartes de l'overlay statique étant rendues plus tard
(après le fetch produits), leur `window.t('product.addToCart')` retournait la
factory Fuse → concaténée en chaîne = son code source (majuscules dues à la
classe CSS `uppercase`). Vérifié en direct : `window.nexusI18n.t === window.t`
était `false`, et `window.t('product.addToCart')` renvoyait `function e(n){…}`.

**Correctifs** (`public/index.html`, les deux) :
1. Fuse chargé en **`type="module"`** au lieu de `defer` → les `var` restent dans
   la portée du module, plus aucune fuite. `window.Fuse` reste exporté car la fin
   du bundle cible `globalThis` (et un module est déjà différé).
2. Nouveau helper **`window.nxT(clé, vars, repli)`** lisant `window.nexusI18n.t`
   (namespace, non écrasable par une lib tierce) ; **les 53 appels `window.t(`**
   du fichier y ont été migrés. `window.t` reste un alias de confort mais plus
   aucun code du repo n'en dépend.

**Vérifié en local** (`static-py`, SW purgé) : `window.t` est de nouveau la
fonction i18n, `Fuse` chargé, recherche floue OK (`"ordinateru"` → « Ordinateur
Portable HP »), **43 boutons** rendus, tous « Ajouter au panier », zéro code
source, aucune erreur console.

⚠️ **Règle à retenir** : ne jamais dépendre d'un **alias global d'une lettre**
(`window.t`) dans le HTML statique — toujours `window.nexusI18n` / `window.nxT`.

## 2026-07-31 — Lecture log console prod : CSP beacon Cloudflare + SMS 502 en attente

Analyse d'un export console de `nexusmarket.sn` fourni par l'utilisateur.
- **Une seule vraie erreur** : `POST /api/sms` → **502**. La route est vivante
  et le gate d'auth OK (probe non signée → 401) ; le 502 vient donc de httpSMS
  lui-même (clé, `HTTPSMS_FROM` ≠ numéro enregistré, téléphone passerelle
  hors-ligne, ou quota). Le détail est déjà exposé depuis `675bf92` mais n'est
  visible que dans le toast admin, pas dans la console. **En attente** : le
  texte du toast pour trancher.
- **CSP** : ajout de `https://static.cloudflareinsights.com` à `script-src` et
  de `https://cloudflareinsights.com` à `connect-src` (`public/_headers`). Le
  beacon Web Analytics est injecté par Cloudflare, pas par le repo — il ne
  figurait donc pas dans le grep d'origines ayant servi à bâtir la CSP. La CSP
  restant en **Report-Only**, c'est du nettoyage de bruit, rien n'était bloqué.
- **Reste du log = bruit, rien à corriger** : `ERR_BLOCKED_BY_CLIENT`
  (adblocker du navigateur de test) ; `ERR_NAME_NOT_RESOLVED` sur Supabase +
  WebSockets fermés + `r.stripe.com` = coupure internet locale en cours de
  session, pas un incident serveur ; avertissement Tailwind CDN (dette connue) ;
  `beforeinstallprompt.preventDefault()` = comportement voulu de `nexusInstall()`.

## 2026-07-12 — Panne Supabase (402) + migration R2 activée

**Incident** : la période de grâce Fair Use a expiré (11 juil.) → Supabase a
restreint tout le projet (`402` sur REST/Storage/Auth) → **site down** ~24h.
Cause : égress déjà consommé (37 Go) avant que les correctifs du 10-11 juil.
(proxies vidéo/image) ne fassent effet sur un nouveau cycle. Base de données
restée saine (`ACTIVE_HEALTHY`, données intactes) tout du long.
- Diagnostiqué via l'API Management (accessible même quand le plan données est
  bloqué) : org toujours en plan **Free**, pas d'upgrade fait.
- Rétabli spontanément (reset de cycle ou action externe) le 12 juil.
- **Bucket R2 `nexus-media` créé** + binding `MEDIA_BUCKET` activé dans
  `wrangler.toml` → la migration R2 préparée la veille (dormante) est passée
  **en fonction**. Testé : lecture vidéo (27 Mo + 12 Mo) en 200, build sain.
- **Statut** : R2 actif, peuplement automatique en cours (chaque média migre
  au premier accès). Reste à confirmer visuellement dans le dashboard R2 que
  les objets apparaissent (connecteur Cloudflare MCP à reconnecter pour que
  Claude puisse le vérifier directement la prochaine fois).
- ⚠️ **Toujours sur plan Free** — R2 protège l'égress média, mais aucune marge
  supplémentaire sur les autres métriques Supabase (DB, Realtime...). À
  surveiller ; upgrade Pro reste une option si un autre poste dérape.

## 2026-07-11 — Diagnostic système admin + bug rôle admin + retrait SMS payant

- **Panneau admin dupliqué puis corrigé** : ajouté d'abord un diagnostic dans
  l'admin React (jamais utilisé par l'utilisateur), puis dans le VRAI dashboard
  utilisé (`/dashboard-admin`, statique) : onglet **« Diagnostic & Tests »**
  (grille d'état des intégrations + test SMS + test WhatsApp inline).
  Endpoint `GET /api/admin/diagnostics` (agrège Supabase/PayTech/Email/
  WhatsApp/SMS/Imagor/Push/file de retry).
- **Bug critique découvert et corrigé** : connexion avec le compte admin
  (Google OAuth) retombait en rôle `buyer`. Cause : `_fetchProfile` timeoutait
  à 2s (latence Sénégal→Supabase Paris) → repli sur `user_metadata` (sans
  `role` pour un compte Google) → `role='buyer'` par défaut, alors que
  `profiles.role='admin'` était correct. Fix : timeout 2s→8s (bundle
  re-hashé) + synchronisation `role:admin` dans `user_metadata` (autorisée
  explicitement par l'utilisateur — l'autorisation serveur reste sur
  `profiles.role`, aucune élévation de privilège réelle).
- **SMS payant retiré** : Africa's Talking / Orange SMS API / Twilio
  **supprimés** de `functions/api/sms.js`, remplacés par **httpSMS**
  (téléphone Android + SIM sénégalaise comme passerelle, coût quasi nul).
  `.env.example`, `wrangler.toml` (INFOBIP_SENDER mort retiré), panneau admin
  et doc mis à jour. Diagnostic httpSMS en cours : `/api/sms` renvoie 502
  (httpSMS rejette), cause exacte pas encore confirmée — endpoint modifié
  pour exposer le détail de l'erreur httpSMS (`httpsms_status` + `detail`),
  **test bloqué par la panne Supabase du 12/07** (login KO tant que 402).
- **Outbox + retry notifications** : table `notification_outbox` +
  `claim_notification_outbox()` (SKIP LOCKED) + `/cron/notify-retry`
  (backoff 15min/1h/3h/6h, 5 essais, dead-letter). Comble le seul manque de
  la chaîne email+WhatsApp existante. Reste : enregistrer le job sur
  cron-job.org (action utilisateur, pas encore confirmée faite).
- **4 libs open-source sans hébergement intégrées** (demande : "gros impact,
  facile, pas d'hébergement") :
  - **Fuse.js** — recherche floue tolérante aux fautes (`labtop`→`laptop`),
    branchée sur `nxpShowAll` + `renderSearch`.
  - **libphonenumber-js** — `toE164()` normalise les numéros SN, branché
    dans le routage WhatsApp (`wa-send.js`, `whatsapp.js`).
  - **html5-qrcode** — scanner QR coursier (FAB 📷 coursier-only, décode
    `NEXUS-PICKUP:<orderId>`, navigue vers la commande sans muter de donnée).
  - **qrcodejs** — QR de retrait affiché sur le suivi commande acheteur
    (`NexusPickupQR`, ferme la boucle avec le scanner).
  - DOMPurify chargé (prêt, pas encore branché sur un sink précis).
- **Proxy image généralisé + Imagor branché** : `/img/:path` sert
  `nexus-images` via Cloudflare (cache 1 an), avec conversion WebP/AVIF via
  **Imagor self-hosted sur Render Free**. Saga de debug : le vrai bug était
  le **padding base64url manquant** dans la signature HMAC (pas un mismatch
  de secret comme on l'a cru pendant 2h) — thumbor/imagor signent en
  base64url AVEC `=`, notre code le retirait. Corrigé.
- **Migration R2 préparée** (dormante ce jour-là) : `functions/_lib/r2media.js`
  (read-through R2 + repli Supabase + auto-peuplement), branché dans `/img`
  et `/stories/media`. Activée le lendemain (cf. entrée 12/07).
- **Piège cache découvert et corrigé 2×** : `public/assets/app.<hash>.js` est
  servi `Cache-Control: immutable` (1 an). Éditer ce fichier SANS renommer le
  hash ne livre RIEN en prod (Cloudflare + navigateurs servent l'ancien).
  A fait perdre le bénéfice de deux commits pendant un moment avant d'être
  repéré et corrigé (`app.256576749a.js` → ... → `app.18f295745d.js`, chaque
  renommage accompagné de la mise à jour de la référence dans `index.html`).

## 2026-07-10 — Généralisation WhatsApp + fix égress vidéo (37 Go)

- **WhatsApp généralisé à tous les événements email** : `sendEventNotification`
  (email + WhatsApp en parallèle, best-effort indépendant) remplace
  `sendEventEmail` dans tous les appelants (paiement, payout, offres, stock,
  commande...). `vendor_new_order` reste email-only volontairement (le
  trigger DB `trg_new_order_vendor_whatsapp` couvre déjà ce cas).
- **Cause du dépassement Cached Egress identifiée** : les vidéos de stories
  (upload direct, hors Mux) étaient servies via l'URL Supabase Storage BRUTE
  dans `og:video`/JSON-LD/lecteur — chaque vue, crawler (Google, surtout
  WhatsApp/Facebook) ou partage retéléchargeait le MP4 complet depuis
  l'égress Supabase. ~89 Mo stockés servis ~400 fois = 37 Go (740% du quota
  Free 5 Go).
- **Fix** : proxy vidéo caché Cloudflare `/stories/media/:id` (cache edge +
  Range/seek), `og:video`/lecteur pointent dessus, `autoplay` retiré +
  `preload="none"` (plus de download spéculatif par les bots).

---

## État actuel des intégrations (résumé, voir `/dashboard-admin` → Diagnostic pour le live)

| Intégration | État | Notes |
|---|---|---|
| WhatsApp | ✅ Green API + repli WAHA | Généralisé à tous les événements |
| SMS | 🔧 httpSMS configuré, 502 à diagnostiquer | Providers payants retirés |
| Images | ✅ Proxy `/img` + Imagor (Render Free) | WebP/AVIF + resize |
| Vidéos stories | ✅ Proxy `/stories/media` | Cache + Range |
| Médias (égress) | ✅ R2 activé (12/07) | Auto-migration en cours |
| Recherche | ✅ Fuse.js (floue) | |
| Téléphone | ✅ E.164 via libphonenumber-js | |
| QR retrait coursier | ✅ Génération + scan | Boucle fermée |
| Notifications retry | ✅ Outbox + cron | Job cron-job.org à confirmer côté user |
| Supabase | ⚠️ Plan Free | Panne 402 le 11-12/07, R2 réduit le risque futur |

## Chantiers en attente / décisions ouvertes

- **SMS httpSMS 502** : diagnostic à finir dès que le login admin refonctionne
  (dépendait de la panne Supabase). Vérifier téléphone en ligne, `HTTPSMS_FROM`
  = numéro exact enregistré, clé API, quota tier gratuit.
- **Job cron-job.org `/cron/notify-retry`** : à créer par l'utilisateur
  (toutes les 5 min), pas encore confirmé fait.
- **QR paiement Wave/Orange Money** (lot 2b) : bloqué, aucun lien de paiement
  Wave/OM n'existe dans le code (mobile-money = PayTech uniquement) — besoin
  du format exact des liens si l'utilisateur veut ce lot.
- **Offline-first (Dexie/IndexedDB)** : évalué, déconseillé pour l'instant
  (cache catalogue localStorage déjà existant, ROI faible vs risque de
  régression à cette échelle).
- **Vérifier peuplement R2** dans le dashboard Cloudflare (objets
  `nexus-stories/...`, `nexus-images/...` dans le bucket `nexus-media`).
- **Verrouillage Storage** (rendre les buckets Supabase privés une fois R2
  confirmé stable) — supprimerait les derniers hotlinks directs résiduels.
- **Upgrade Supabase Pro** : toujours pas fait, projet reste sur Free malgré
  la panne du 11-12/07. À reconsidérer si un autre poste (pas média) dérape.
