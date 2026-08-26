# Journal du projet NEXUS Market

Historique chronologique (le plus récent en haut) de ce qui a été fait, pourquoi,
et où en est chaque chantier. Complète `CLAUDE.md` (référence technique/pièges,
non chronologique). Mis à jour après chaque session de travail avec Claude.

---

## 2026-08-26 — Message de bienvenue auto (email + WhatsApp) après approbation vendeur

**Demande** : envoyer automatiquement un message WhatsApp + email de bienvenue
au nouveau vendeur dès que son compte est approuvé par l'admin.

**Constat** : les templates `vendor_approved` (email + WhatsApp) existaient déjà
dans `notify.js` et l'endpoint `/api/notify-user` les acceptait déjà — mais
**rien ne les déclenchait réellement à l'approbation**. Les 2 écrans admin qui
approuvent un vendeur envoyaient chacun un email différent en client-side
(un `fetch('/api/email')` brut, un `EmailService.sendVendorApproval()`),
sans jamais envoyer de WhatsApp.

**Fait** : trigger DB `trg_vendor_approved_notify` sur `profiles` (AFTER UPDATE,
transition vers `status='approved'` + `role='vendor'`) qui appelle
`/api/notify-user` en interne (`X-Internal-Secret`) — source de vérité unique,
fonctionne peu importe quel écran admin a fait l'approbation. Les 2 anciens
envois d'email client-side ont été retirés (évite le double email, ajoute le
WhatsApp qui manquait). `functions/api/notify-user.js` accepte maintenant les
appels internes en plus du JWT existant, sans rien changer pour les appelants
existants.

**État final** : testé (mock fetch, appel interne accepté + email envoyé au
bon destinataire ; appel non authentifié toujours rejeté). Migration SQL
appliquée en prod. Reste à committer/pousser le code applicatif.

---

## 2026-08-26 — Dashboard admin « Utilisation Plateformes » (Supabase, Cloudflare, services tiers)

**Demande** : un endroit unique dans le tableau de bord admin pour surveiller la
consommation sur toutes les plateformes utilisées pour faire tourner le site
(Supabase, Cloudflare, etc.), afin de ne pas dépasser les limites gratuites.

**Recherche préalable** : vérifié que l'API Management Supabase n'expose AUCUNE
route usage/billing/stats (seulement `/billing/addons`) — l'égress n'est donc
pas récupérable par API, seulement la taille DB/storage (calculable en SQL
direct). Vérifié aussi que le token OAuth local de `wrangler` n'a pas le scope
Cloudflare Analytics.

**Fait** : `GET /api/admin/platform-usage` (admin only) agrège :
- Supabase : taille DB + storage en temps réel via une RPC SQL
  (`admin_supabase_usage()`, `sql/2026_08_25_admin_platform_usage.sql`) —
  égress non disponible, lien direct vers le dashboard à la place.
- Cloudflare : bande passante/requêtes de la zone nexusmarket.sn via GraphQL
  Analytics — optionnel (`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ZONE_ID`), grisé
  si non configuré, rien ne casse.
- Liens directs vers 11 autres dashboards (WhatsApp Green API/WAHA, Groq,
  Resend/Brevo, Firecrawl, Brave Search, Apify, PayTech) qui n'ont pas d'API
  usage uniforme.

Nouveau panneau `PlatformUsagePanel` + entrée de nav « Utilisation
Plateformes » dans le bundle admin (`app.2f225106de.js`).

**État final** : déployé (bundle renommé + index.html mis à jour). Supabase
fonctionne dès maintenant (aucune config supplémentaire requise). Cloudflare
nécessite que l'utilisateur crée un token API dédié (scope Zone Analytics
Read) et l'ajoute aux variables Cloudflare Pages — sinon la section reste
grisée sans rien casser.

---

## 2026-08-16 — Fix affichage annonces « vitrine » (prix placeholder + image cassée)

**Demande** (avec capture d'écran) : une fiche « 2JR Location de Voitures » affichait
« 656 FCFA » (prix absurde) et une image cassée, alors que la description dit
« Tarif sur devis ». Demande d'adapter l'affichage de chaque type d'annonce à son
besoin réel plutôt que d'imposer le gabarit produit e-commerce.

**Cause racine (vérifiée en base)** : 65 annonces `is_rental` (et par construction
toutes les 39 `is_realestate`) sont des **fiches vitrine** importées en masse depuis
`sql/2026_08_12_loueurs_vitrine.sql` (`rental_specs.is_vitrine=true`) — contact-only,
sans stock ni tarif réel. Leur colonne `price` porte un **placeholder 1.00€**
(→ 656 FCFA une fois converti) et `image_url`/`images` sont `null`. `getProductImage()`
retombait sur `CATEGORY_IMAGES[product.category]`, mais ces imports utilisent des
catégories libres (« Voiture », « Immobilier ») qui ne correspondent à AUCUNE clé de
la map (clés attendues : « Voitures », « Vente immobilier »…) → image cassée.

**Fait** (`public/assets/app.<hash>.js`, `public/index.html`) :
- `isVitrineListing(product)` (détecte `rental_specs`/`animal_specs.is_vitrine`) +
  `vitrineWhatsappUrl()` — nouveaux helpers, réutilisés partout où un prix/image de
  produit est affiché.
- `getProductImage()` : repli par **flag de type** (is_rental/is_realestate/is_animal/
  is_local) AVANT le repli par catégorie — fiable quel que soit le libellé importé.
- `PriceDisplay` (fiche détail) et `NxCard` (grille catalogue) : affichent « Sur devis »
  au lieu du prix converti pour une annonce vitrine, avec bouton WhatsApp « Contacter »/
  « Demander un devis » à la place d'« Ajouter au panier » (stock/quantité/livraison
  masqués — aucun sens pour une fiche contact importée).
- Même traitement appliqué aux nouvelles sections homepage (`sbCard`/`card()` dans
  `index.html`, ajout de `rental_specs,animal_specs` au `select` REST).
- **Piège de diagnostic** : le bug semblait persister après chaque édition malgré des
  rechargements — cause = un Service Worker qui reprenait le contrôle de la page plus
  vite que je ne pouvais le désinscrire (`clients.claim()` immédiat), servant une
  ancienne exécution du bundle. Confirmé par un `console.log` de canari jamais déclenché.
  Résolu en appliquant la règle CLAUDE.md §« Bundle app.hash.js » : renommage vers un
  nouveau hash de contenu (`app.f427b8920b.js`) + MAJ du `<script src>` — un hash inédit
  ne peut être servi par aucun cache existant.

**État** : vérifié en local (`static-py`), le cas réel « 2JR Location de Voitures »
affiche désormais « Sur devis » + bouton WhatsApp fonctionnel, sans stock/quantité/
livraison factices, sur la fiche détail ET la carte grille ET les rails homepage.

**Suite (même session)** : demande complémentaire — « pas d'ajouter au panier mais
voir/contacte, des mots plus adaptés ». Élargi : Location/Immobilier/Élevage/Terroir
sont par conception des verticales **mise en relation** (MVP annonce + contact, cf.
CLAUDE.md § NEXUS Location — pas un flux panier), vitrine ou **vrai compte vendeur**.
Nouveau `isContactOnlyListing()` (is_rental/is_realestate/is_animal/is_local OU
vitrine) : carte → bouton « 👁️ Voir l'annonce » (vrai compte) ou « 💬 Contacter »
WhatsApp (vitrine) au lieu d'« Ajouter au panier » ; fiche détail → bouton unique
« Contacter le vendeur » (message interne) au lieu d'Ajouter/Offre pour un vrai
compte. Vérifié sur un vrai bien immobilier (`Studio meublé Mermoz`, 249 998 FCFA
— prix réel affiché, pas de stock/quantité, CTA adapté).

**Suite** : vérifié en prod (nexusmarket.sn) que le déploiement avait bien pris le
nouveau hash `app.f427b8920b.js` et que le cas réel se comportait identiquement au
local (Sur devis + Contacter, fiche détail sans stock/quantité). Demande complémentaire :
« Nouveaux Arrivages » ne doit rester QUE des produits classiques (pas les nouvelles
verticales, qui ont désormais leurs propres sections dédiées plus bas). Ajouté
l'exclusion `is_rental/is_realestate/is_animal/is_local=not.is.true` à sa requête
uniquement (Meilleures Ventes/Recommandé inchangés, non demandé). Vérifié : les 12
items affichés sont tous des produits réels (prix normaux, aucun « Sur devis »).

**Suite** : même exclusion étendue à Meilleures Ventes et Recommandé (mutualisée
dans une nouvelle variable `QP`), qui partageaient auparavant la requête non filtrée
`Q` et pouvaient donc aussi afficher élevage/location/immobilier avec un prix/CTA
inadapté. Vérifié en local : les 12 items de chaque section sont exclusivement des
produits réels.

---

## 2026-08-16 — Élevage/Terroir, Location, Immobilier, Covoiturage, Troc sur l'accueil + admin

**Demande** : afficher les annonces élevage/terroir, location, immobilier, covoiturage et
troc sur la page d'accueil au même titre que les produits, avec un contrôle admin pour
activer/désactiver chaque type.

**Découverte clé** : le contrôle admin demandé **existait déjà** — `nexus_monetization_cfg`
(`app_config`, exposé publiquement dans `window.NEXUS_MONET`) porte déjà les flags
`mod_elevage_enabled`, `rental_enabled`, `mod_realestate_enabled`, `mod_transport_enabled`,
`mod_troc_enabled`, éditables depuis Admin → Paramètres → onglets **Modules**/**Location**.
Ces flags ne gataient jusqu'ici que les FAB/modales (widgets), pas l'accueil — les 5 verticales
étaient donc invisibles sur la page d'accueil (élevage/terroir et location/immobilier sont des
`products` avec des flags `is_animal`/`is_local`/`is_rental`/`is_realestate` non inclus dans les
requêtes des sections existantes ; covoiturage/troc sont des tables séparées `transport_lines`/
`troc_listings`, jamais interrogées par l'overlay statique).

**Fait** (`public/index.html`) :
- 5 nouvelles sections horizontales sur l'accueil (même style que Meilleures Ventes/Nouveaux
  Arrivages), insérées après « Recommandé pour vous » : Élevage & Terroir, Location, Immobilier,
  Covoiturage & Transport, Troc & Échange.
- Chaque section respecte le flag admin existant correspondant (fail-open si non chargé, comme
  le gate central) et se masque automatiquement si désactivée OU si aucune annonce n'est
  disponible (même pattern que Ventes Flash).
- 2 nouveaux rendus de carte : `transportCard()` (trajet + bouton WhatsApp) et `trocCard()`
  (clique vers `/?troc=<id>`, réutilise la fiche détail partageable construite le 2026-08-13).
  Élevage/Location/Immobilier réutilisent `sbCard()` existant (déjà branché sur le clic-ouverture
  produit générique `.nx-prodcard`).
- Aucune nouvelle table/RLS nécessaire : `products` (is_animal/is_local/is_rental/is_realestate),
  `transport_lines` et `troc_listings` sont déjà lisibles publiquement (vérifié en base).

**État** : vérifié en local (`static-py`, port 5598) — les 5 sections existent, Location/
Immobilier/Covoiturage affichent de vraies données (12 items chacune), Élevage/Terroir et Troc
se masquent correctement (aucune donnée active actuellement en base pour ces deux-là, comportement
attendu). Pas encore déployé/commité.

---

## 2026-08-15 — Slogan « Purement Sénégalais » + stratégie marketing (4 cadres) + kit carrousel complémentaire

**Demande** : l'utilisateur a communiqué le slogan officiel de NEXUS Market — **« Purement
Sénégalais »** — et a partagé une synthèse de 4 ouvrages marketing (Cercle d'Or de Sinek,
6 principes d'influence de Cialdini, méthode problème DUR/avatar de Leloup, piliers marketing
digital de Gastaud), en demandant de mettre en place ces stratégies.

**Fait** :
- Intégré « Purement Sénégalais » dans le pied de page de **tous les slides** des 4 kits de
  carrousels existants (`carrousels-nexus.html`, `-lancement.html`, `-tutoriel.html`,
  `-complementaires.html`) — remplace l'ancien texte « · nexusmarket.sn ».
- Ajouté un **5e deck « Pourquoi NEXUS Market »** (6 slides) en tête de
  `carrousels-complementaires.html`, structuré explicitement Pourquoi → Comment → Quoi
  (Cercle d'Or), avec un slide « problème » formulé en DUR (Douloureux/Urgent/Reconnu).
- Écrit `publicite/strategie-marketing-4-livres.md` : traduit les 4 cadres en décisions
  concrètes pour NEXUS Market (personas, leviers d'influence déjà actifs vs à activer,
  entonnoir acquisition→rétention→recommandation mappé aux contenus déjà produits, règles
  vidéo sous-titres/3 premières secondes, ce qui reste à décider par l'utilisateur — chiffres
  réels de preuve sociale, cibles chiffrées, budget pub).

**État** : vérifié en preview (rendu correct, footer + nouveau deck). Kit 4
(`carrousels-complementaires.html`, 12 decks au total avec l'ajout) pas encore committé — à
committer avec la même confirmation que les kits 1-3 (commit `a0e5d0e`, toujours non poussé).

---

## 2026-08-13 — URLs produit partageables (History API) sans casser la SPA/SEO

**Demande** : pouvoir avoir un lien différent à chaque élément touché, partageable,
sans problème avec Google.

**Cause du problème** : au deep-link `?product=id`, l'app faisait un
`history.replaceState(..., pathname)` qui **effaçait le `?product`** juste après ouverture
→ impossible de copier le lien de l'élément courant.

**Travail (bundle, composant PublicCatalog — point central `selectedProduct`)** :
- Sync URL↔produit **sans rechargement** : ouverture → `pushState ?product=<id>`,
  fermeture → `replaceState` propre. Le bouton retour ferme la fiche (popstate), avant
  la rouvre.
- **Canonical dynamique** vers la vraie fiche serveur `/produit/<id>` quand un produit
  est ouvert, réinitialisé à `/` sinon (anti-doublon Google : l'état SPA pointe vers la
  page indexable dédiée).
- Deep-link robuste : si le produit partagé n'est pas dans le lot chargé, ouverture via
  l'événement `nexus:open-product` (repli Supabase).
- **Piège corrigé (course au montage)** : un ref `_prevProdRef` empêche l'effet de sync
  de retirer le `?product` d'un lien partagé au tout premier rendu (avant que le handler
  deep-link l'ait lu). On ne nettoie l'URL que sur une vraie fermeture.
- Les **annonces express** passent par le même `selectedProduct` → déjà couvertes.

**Vérifié en navigateur** (serveur local, SW purgé) : ouverture/fermeture/retour/avant +
rechargement d'un lien partagé → tous OK (URL, canonical, modale). `node --check` OK.
Cache-busting : `app.9e3420e669.js` → `app.c586309029.js` + index.html.

**Étendu aux BOUTIQUES (2026-08-13, suite)** : même patron sur l'état `showVendorPagePub`
→ `?vendor=<id>` partageable + canonical `/vendeur/<id>` + deep-link + retour navigateur
(popstate réconcilie produit ET boutique). ⚠️ Piège corrigé : l'effet boutique doit être
déclaré APRÈS le `useState` de `showVendorPagePub` (sinon TDZ dans le tableau de deps →
écran blanc). Vérifié navigateur : deep-link `?vendor` ouvre + garde l'URL + canonical ;
fermeture nettoie ; app rend sans erreur. Bundle → `app.bd70d1d096.js`.

**Étendu aux STORIES (2026-08-13, suite)** : `NexusStoriesWidget` a un élément courant
(`items[idx]`) → sync `?story=<id>` + canonical `/stories/<id>` (replaceState seul → pas
de spam d'historique) ; le deep-link `?story=<id>` ouvre désormais LA bonne story (fix :
`wantIdRef` lu depuis l'URL, avant il ouvrait toujours à l'index 0). Vérifié navigateur
(2 stories `closed` : « Chien »/« Demo ») : deep-link ouvre la bonne, URL gardée,
canonical `/stories/id`, fermeture nettoie. Bundle → `app.6458cdda46.js`.

**Fiches détail TROC & PRO construites (2026-08-13, suite)** — la vraie solution demandée :
- **Troc** (`NexusTrocWidget`, bundle) : nouvel état `selectedTroc` + modale détail (photo,
  description, « recherche en échange », Proposer, Partager), carte cliquable, sync
  `?troc=<id>` + canonical `/troc/<id>`, deep-link (fetch par id), retour navigateur.
  Vérifié : non-bloquant, deep-link gracieux (aucun troc en base pour un test live complet ;
  code = patrons produit/vendeur déjà validés). Insertion de données de test en prod
  refusée par le classifieur (garde-fou) → pas contournée.
- **Pro** (module VANILLA IIFE `window.__NEXUS_PRO__` dans `public/index.html`, PAS le bundle) :
  fonctions `showProDetail(b)` (modale, calquée sur le modal d'avis) + `syncProUrl` +
  `openPro(id)` ; tuiles (nearby ET recherche par nom) cliquables → fiche ; deep-link
  `?pro=<id>` (fetch `pros` par id) ; `?pro` + canonical `/pro/<id>` ; retour navigateur
  (popstate). **Vérifié en navigateur avec un vrai pro (« deme sene ») : deep-link ouvre la
  bonne fiche, URL/canonical OK, fermeture + retour nettoient.** Piège corrigé : le popstate
  doit appeler `syncProUrl(null)` (sinon canonical pas réinitialisé au retour).
- Bundle → `app.80cf413a23.js`. `node --check` OK.

**Bilan liens partageables** : produits, annonces express, boutiques, stories, **trocs**,
**pros** = tous couverts (URL + canonical vers la fiche serveur indexable).

---

## 2026-08-13 — SEO : couverture d'indexation de toutes les entités (+ vendeurs)

**Demande** : que chaque entité (annonces pros/agents, coursiers, produits, services,
fonctionnalités) soit indexée par Google et bien positionnée, et que ce soit
**automatique pour les futurs produits**.

**Audit (ancré dans le code)** : le site a déjà une forte infra SEO programmatique —
pages `/produit/[id]`, `/pro/[id]`, `/vendeur/[id]`, `/annonce/[id]`, `/troc/[id]`,
`/stories/[id]`, `/categorie/[slug]`, `/ville/[slug]`, 15 guides, 16 posts blog, +
3 sitemaps **dynamiques** (index/listings/categories) dans robots.txt, bots IA autorisés,
schema Product complet (offers+shipping+return+aggregateRating) via `_lib/seo.js`.
→ Les nouveaux produits/annonces/trocs/stories/pros `active` sont **déjà** repris
automatiquement (sitemap dynamique, cache 1h). L'automatisation demandée existait déjà
pour les produits.

**Trou trouvé + corrigé** : les boutiques **vendeurs** (`/vendeur/[id]`, vraie vitrine
JSON-LD Store) n'étaient dans **aucun sitemap** → jamais découvertes. Ajout de la requête
`profiles?role=eq.vendor` au sitemap **dynamique** `sitemap-listings.xml.js` → boutiques
actuelles ET futures indexées automatiquement.

**Non fait (raison)** :
- **Coursiers** : pas de page individuelle. Recommandation = hubs `/coursiers/[ville]`
  (anti contenu-mince), MAIS `couriers.zones`/ville non renseigné à la promotion des 88
  livreurs → un hub serait vide. À débloquer en enrichissant la ville des coursiers
  (dispo dans `prospection/livreurs_google_maps_senegal.csv`).
- **Agents immobiliers / immobilier** : à clarifier (comptes `vendor` → déjà couverts ;
  sinon route dédiée). `produit/[id]` ne pose pas de schema RealEstateListing spécifique
  (page Product générique servie — indexable, non bloquant).

**État** : `node --check` OK. À déployer. Reste manuel côté utilisateur : soumettre
`/sitemap_index.xml` dans Google Search Console.

---

## 2026-08-13 — Importateur : upload des photos produit vers Supabase Storage

**Demande** : pour les produits de `catalogue_produits_facebook.csv`, avoir les photos
et faire en sorte que `nexus_importer.html` puisse uploader les photos vers Supabase
avant l'export vers `products`.

**Décision sourcing** : Facebook non scrapable (noms de page seulement, mur d'auth, CGU) ;
téléchargement web de masse écarté (qualité/droits). L'utilisateur fournira un **dossier
de fichiers locaux** → l'importateur les apparie et les upload.

**Travail effectué** (`nexus_importer.html`, onglet ④) :
- Zone de dépôt accepte désormais **CSV + images** (`accept=".csv,image/*"`).
- **Appariement auto image↔produit par nom de fichier** (normalisation sans accents/
  extension/suffixe `-1`, score de recouvrement ≥ 0,5 ; multi-images/produit ; non
  appariés signalés).
- **Attache manuelle par ligne** (bouton « 📎 Ajouter un fichier » / « ✕ Retirer »).
- À l'export : **upload des fichiers locaux vers Supabase Storage bucket `products`**
  (`sb.storage…upload` + `getPublicUrl`, cache 1 an) → renseigne `image_url`/`images`
  avant `upsertPlainProduct`. Le champ URL reste dispo en repli.
- Le bucket cible `products` = celui utilisé par `nexus_studio_ai.py`.

**État** : implémenté + **vérifié en navigateur** (serveur statique local) — parse OK,
module chargé sans erreur, simulation dépôt CSV+images : 2 appariées / 1 non appariée
correctement, badges « à uploader » et contrôles 📎 rendus. Upload réel non testé
(nécessite la Service Role Key + Storage). ⚠️ Le bucket `products` doit être **public**
pour que `getPublicUrl` serve les images.

---

## 2026-08-13 — Coursiers : mise en ligne par l'admin (validation → dispo + en ligne)

**Demande** : un coursier n'est pas en ligne par défaut ; dès que l'admin valide le
compte, le livreur doit être disponible ET en ligne ; et l'admin doit pouvoir mettre
en ligne / hors ligne un coursier à la main.

**Contexte technique** : « en ligne » = `couriers.is_available=true` + `profiles.courier_status='available'`
(flag d'intention — le cron `dispatch_tick_all` bloc C2 remet `is_available=false` si
`courier_status<>'available'`, donc c'est LUI la source de vérité) + `location_updated_at`
frais (< 30 min) pour le badge live et le tri « en ligne d'abord ». L'ancien
`approveCourier` ne posait que `status='active'` → le coursier restait hors ligne.

**Travail effectué** :
- **`sql/2026_08_13_courier_admin_online.sql`** (nouveau) — 2 RPC SECURITY DEFINER,
  garde `is_admin()` : `admin_approve_courier(id)` (pending→active + is_available + geo/
  intention en ligne) et `admin_set_courier_online(id, online)` (toggle). Bloc optionnel
  (commenté) pour valider+mettre en ligne en masse les 88 coursiers `pending`.
- **Frontend** (bundle) — `approveCourier` appelle désormais `admin_approve_courier`
  (repli direct si RPC absent) et le libellé devient « ✅ Approuver + en ligne » ; ajout
  de `setCourierOnline` + bouton « 🟢 Mettre en ligne » / « ⚪ Mettre hors ligne » sur les
  coursiers actifs ; badge « 🟢 En ligne / ⚪ Hors ligne ».
- **Cache-busting** : `app.9981232cb5.js` → `app.9e3420e669.js` + MAJ `index.html`.

**État** : code écrit, `node --check` OK. **À déployer + exécuter le SQL** dans Supabase.
Non testé en prod (panneau admin derrière auth). Rappel : le « en ligne live » (badge)
décroît après 30 min sans ping réel, mais le coursier reste **proposable** (fonction
`nearby_couriers_offline`, intention `available` conservée).

---

## 2026-08-12 — Campagnes WhatsApp de masse (pendant de la campagne email)

**Demande** : comme pour les campagnes email, pouvoir envoyer des messages WhatsApp
en masse depuis l'admin.

**Travail effectué** :
- **Backend** `functions/api/admin/broadcast-whatsapp.js` (nouveau) — POST admin only,
  calqué sur `broadcast.js`. Lit les téléphones depuis `profiles` (filtre audience/rôle,
  `phone NOT NULL`), dédoublonne + valide E.164 (SN), envoie un message individuel via
  `sendWhatsAppDirect` (Green API → repli WAHA) et journalise chaque envoi dans
  `whatsapp_logs`. Mode `test` = envoi au téléphone de l'admin (résolu via profiles).
  Rate-limit 3/10 min. Envoi **séquentiel** et plafonné (`BROADCAST_WA_MAX`, défaut 200)
  pour ménager le quota fournisseur + la limite de sous-requêtes Cloudflare.
  Pas d'audience `newsletter` (cette table n'a pas de téléphone).
- **Frontend** (bundle `app.<hash>.js`) — composant `AdminBroadcastWhatsAppPanel`
  (message + lien optionnel + sélecteur d'audience + test/envoi), entrée de menu admin
  « 📲 Campagne WhatsApp » et routing `view === "broadcast_wa"`.
- **Cache-busting** : `app.b8916030d4.js` → `app.9981232cb5.js` + MAJ `index.html`
  (obligatoire, /assets/* immutable 1 an).

**État** : code écrit, `node --check` OK (backend + bundle). **Non déployé / non testé
en prod** (panneau derrière l'auth admin). À vérifier après déploiement : envoyer un test
depuis le panneau (nécessite un téléphone sur le profil admin).

---

## 2026-08-11 — Élargissement des métiers pris en charge (importer + site)

**Demande** : en se basant sur le dossier `prospection/`, élargir le nombre de métiers
« pros » pris en charge dans le site et dans l'app `nexus_importer`, et ajouter les autres
métiers nécessaires.

**Travail effectué** :
- **`nexus_importer.html` — `FILE_MAP`** passé de **17 → ~65 règles**. Auparavant seuls
  ~17 des 68 CSV de `prospection/` étaient reconnus (le reste tombait en `custom`, à
  corriger à la main). Désormais chacun des 68 CSV est classé correctement (vérifié par
  script `/tmp/testmap.mjs` : **0 non-reconnu**). Ajout de sections : Auto/Moto, Énergie/
  Technique, Services à la personne, Événementiel/Créa/Digital, Agri/Alim/Artisanat, plus
  des métiers courants au-delà du dossier (serrurier, antenniste, puisatier, étancheur,
  réparateur téléphone, informaticien, tapissier, cordonnier, pressing, vétérinaire,
  chauffeur…).
- **Ordre = priorité** : les variantes spécifiques (auto/moto) placées AVANT les génériques
  homonymes (`electric.*auto` avant `electric`, `peintre.*auto`/`tolier` avant `peintre`,
  `mecan.*moto` avant `garage|mecan`, `climat.*auto` avant `climat|froid`, `vitrier.*auto`
  avant `vitrier`). Deux collisions détectées au test et corrigées : `transformateurs_
  alimentaires` était capté par `/formateur/` (« transFORMATEUR ») → frontière de mot
  `\bformateur` ; `transport_*` non reconnu → nouvelle règle `vendor` « Transport / Voyageurs ».
- **`public/index.html` — liste `METIERS`** du module NEXUS Pro passée de **12 → 55 métiers**
  (chips « Trouver un pro » + inscription). Les `id` sont **strictement alignés** sur les
  libellés « pro » du `FILE_MAP` (cross-check `/tmp/xcheck.mjs` : 55 = 55, aucune divergence
  dans les deux sens) — indispensable car la promotion d'un prospect écrit `profession =
  libellé`, et un chip ne retrouve ses pros que si la chaîne correspond exactement.

**État** : appliqué localement. ⚠️ **Non déployé** — `public/index.html` charge le React
compilé depuis `public/assets/app.<hash>.js` mais la liste `METIERS` vit bien dans
`index.html` (module IIFE NEXUS Pro inline), donc pas de rebuild de bundle nécessaire ici.
Reste à commit + push (déclenche le build Cloudflare Pages). Vérifs faites : classification
des 68 CSV, alignement des libellés. Non fait : test visuel des chips en preview.

---

## 2026-08-10 — Importateur catalogue : Transport (lignes+récurrences), Location, Immobilier

**Demande** : que `nexus_importer.html` puisse exporter vers nexusmarket.sn les données de
`prospection/transport_dakar_regions_senegal.csv` en créant **trajets + récurrences** pour
tous les types de récurrence des lignes, + **faire de même pour la Location et l'Immobilier**,
en veillant à ce que **tout marche normalement après l'export** sur le site.

**Travail effectué** :
- **Nouvelles tables** `sql/2026_08_10_transport_lines.sql` : `transport_lines` (la ligne
  commerciale régulière = le « trajet » : compagnie, véhicule, gare, prix FCFA, horaires bruts,
  services…) + `transport_recurrences` (le calendrier). Distinct de `transport_trips`
  (covoiturage à départ unique daté, qui reste inchangé). RLS = lecture publique des lignes
  actives + admin ; GRANT SELECT anon/authenticated (rappel mémoire orders-update-grant-403).
- **Normalisation des récurrences** : `Frequence` + `Jours_operation` → `kind` ∈
  {`daily`, `multiple_daily`, `weekly`, `on_demand`, `special_event`} + `days_of_week`,
  `excluded_days`, `departure_times`. Cas couverts et testés (14 combinaisons réelles) :
  quotidien, plusieurs_par_jour, hebdomadaire (Mar|Ven…), sur_demande (avec jours),
  « quotidien sauf Sam » → daily+excluded, Magal/15 Août → special_event. **Piège corrigé** :
  Engines Senegal a `Frequence=quotidien` mais `Jours_operation=Lun|Mar|Mer|Jeu|Ven|Sam`
  (6 j, pas dimanche) → une liste de jours explicite **prime** sur « quotidien » (sinon
  faussement daily). Idempotence : upsert ligne sur (operator,origin_city,destinations,
  vehicle_type) puis delete+insert des récurrences.
- **Front** (`public/index.html`) : `DataService.searchLines()` (lit lignes + récurrences,
  dégrade en [] si migration pas encore jouée) + **nouvel onglet « 🚌 Lignes régulières »**
  dans la modale Covoiturage (à côté de Covoiturage / Publier), avec récurrence lisible
  (« 🗓️ Tous les jours sauf samedi · départ 07h00/15h00 »), prix, durée, services, et bouton
  **WhatsApp/tel** vers la compagnie. C'est ce qui rend les données visibles après export.
- **Importateur** (`nexus_importer.html`) : 3ᵉ onglet **« Catalogue »**, détection auto par
  colonnes : Transport (Compagnie+Type_vehicule) → lines+récurrences ; **Location**
  (Categorie+Prix_jour_fcfa) et **Immobilier** (Transaction+Type_bien) → un **compte annonceur
  (vendor)** par téléphone + un **produit** `is_rental`/`rental_specs` ou
  `is_realestate`/`realestate_specs`, **exactement** les champs que lisent les modules Location
  (~L10087) et Immobilier (~L10376) du site. Prix converti **FCFA→EUR** (÷655,957, convention
  de la pile) ; montants FCFA d'origine conservés dans les `*_specs`. Dry-run + idempotence
  (produit dédupliqué par vendor_id+name+flag ; cache annonceur anti-doublon Auth).
- Formats CSV attendus (à préparer côté data) :
  - Location : `Nom,Categorie,Prix_jour_fcfa,Prix_semaine_fcfa,Caution_fcfa,Min_jours,Etat,Region,Ville,Annonceur,Telephone,Description,Image_url,Latitude,Longitude`
  - Immobilier : `Titre,Transaction,Type_bien,Prix_fcfa,Surface_m2,Pieces,Chambres,Salles_bain,Meuble,Region,Quartier,Annonceur,Telephone,Description,Image_url,Latitude,Longitude`
- **Prospection Location/Immobilier** (format prospect standard 8 col. → onglet ①, comptes
  vendeurs) : `prospection/agences_immobilieres_senegal.csv` (64 agences : Dakar SICAP/
  Sacré-Cœur/Point E/Mermoz + Saly/Thiès/Mbour, sources senegal-online + FB) et
  `prospection/loueurs_materiel_senegal.csv` (31 loueurs : événementiel, voiture, BTP/engins,
  + pages FB). FILE_MAP de l'importateur étendu (`/immobili/`, `/loueur|location.*materiel/`
  → vendor). Ces entreprises s'onboardent comme vendeurs, puis publient leurs annonces
  (ou un CSV riche alimentera l'onglet ③ Catalogue).

**Vérifs** : `node --check` du module importateur OK ; parsing récurrences testé sur les 14
combinaisons réelles du CSV ; site chargé en local (static-py:5598), modale Covoiturage → les
3 onglets s'affichent, « Lignes régulières » dégrade proprement en « Aucune ligne trouvée »
(pas de crash, aucune erreur JS console) ; onglet Catalogue de l'importateur initialisé (DDL
transport affiché, écho mot de passe).

**Extension session suivante** : fichiers catalogue remplis (annonces réelles à prix) et
prospection Location/Immobilier élargie à toutes les catégories + sources Facebook.

**État** : code prêt, **non déployé**. À faire par l'utilisateur : (1) lancer
`sql/2026_08_10_transport_lines.sql` dans Supabase ; (2) l'édition du front est dans
`public/index.html` directement (pas dans `app.<hash>.js`) → se déploie à chaque push
sans renommer de hash ; (3) importer les CSV via l'onglet Catalogue (dry-run d'abord).
Les lignes transport apparaîtront dans Covoiturage → « Lignes régulières » ; les annonces
Location/Immobilier dans leurs verticales.

---

## 2026-08-11 (suite 3) — Module Pro : repli ville quand la géoloc est refusée

**Demande** : « voir erreur localisation ». Reproduit sur le site live : `geolocationPermission='denied'`.

**Cause** : dans le module NEXUS Pro (« Trouver un pro » → `showNearby`, index.html ~L10863), si
`NexusMap.locateMe()` échoue (refus/indispo GPS — fréquent sur desktop), le `.catch` affichait une
**impasse** (« Position indisponible (refus GPS). Activez la localisation… ») et **aucune liste** →
personne ne pouvait voir les pros sans autoriser sa position. C'est l'« erreur localisation ».

**Fix** (index.html, donc déploie sans renommer de hash) : refactor `showNearby` → `renderProsAt(host,
profession, pos, opts)`. En cas d'échec géoloc, repli automatique sur **Dakar** + une **barre de
repli** : sélecteur de 12 villes (`PRO_CITIES`) + bouton « 📍 Ma position » (réessaie la géoloc).
`nearby_pros` est alors appelé avec les coords de la ville choisie → la liste s'affiche quand même.
Vérifié en local (géoloc forcée en refus) : plus d'impasse, barre + 12 villes + bouton présents,
`node --check` du module OK.

---

## 2026-08-11 (suite 2) — Outil de prospection `tools/scraper/` (Apify Maps + Crawlee)

**Demande** : mettre en place Apify/Crawlee pour automatiser la prospection, **aussi pour Google
Maps**, sans lancer de prospection (juste installer + documenter l'usage).

**Constat** : le scraping gratuit d'annuaires est fragile (annuaire-senegal masque les tél,
GoAfrica renvoie 500 aux robots) ; Google Maps est verrouillé (JS + anti-bot) → la voie fiable
pour Maps = l'**Actor Apify** (cloud, maintenu).

**Livré** — `tools/scraper/` (outil local séparé, comme nexus_importer.html) :
- `apify-maps.mjs` : Google Maps via l'Actor `compass/crawler-google-places` (fetch direct à
  l'API Apify, **aucune dépendance**) → nom, tél, adresse, **GPS réel**.
- `crawlee-directory.mjs` : annuaires statiques via **Crawlee CheerioCrawler** (léger, pas de
  navigateur), piloté par config JSON de sélecteurs (`configs/example-directory.json`). Best-effort.
- `lib/prospects-csv.mjs` : mapping → **format importateur** (`Nom,Ville,Region,Adresse,Telephone,
  Source,Latitude,Longitude`) + dédup + normalisation tél `+221 XX XXX XX XX` + priorité mobile (7X).
- `selftest.mjs` (9 assertions, OK), `README.md` (mode d'emploi + coûts + note CGU), `.gitignore`
  (node_modules/CSV/*.log ignorés).

**Périmètre éthique** : annuaires publics + Google Maps uniquement. **Pas** de Facebook/Instagram (CGU).
**Setup vérifié SANS prospection** : `npm install` (308 paquets) OK, Crawlee charge, self-test 9/9,
token Apify de l'utilisateur **validé** (`users/me` : compte free, 5 $/mois). Aucun scraping lancé.
Le token n'est **pas** stocké/committé ; sortie CSV → `prospection/` (gitignored, local).

---

## 2026-08-11 (suite) — Panneau admin « Prospects » + fix visibilité pros promus

**Demande** : (1) les comptes pro promus par l'app n'apparaissent nulle part sur le site ; (2)
pouvoir **promouvoir les prospects directement depuis le tableau de bord admin**.

**Cause racine visibilité (trouvée)** : la promotion crée la fiche `pros` en **`status='hidden'`**,
mais la RLS de base `pros_select_public` ne laisse lire QUE `status='active'`. Le panneau « Modération
NEXUS Pro » lit `pros` avec la session admin (pas la service key) → il ne voit pas les fiches hidden.
**Fix = appliquer `sql/2026_06_20_pros_admin.sql`** (policy `pros_admin_all` : l'admin voit/modifie
toutes les fiches). C'est le seul chaînon manquant côté visibilité.

**Nouvelle fonctionnalité — panneau admin « 📇 Prospects »** :
- **Backend** `functions/api/admin/promote-prospect.js` (POST, `requireAdmin`) : lit `prospects`,
  crée le compte Auth via l'API admin REST (**service key SERVEUR uniquement**, jamais dans le
  navigateur), pose les flags profil (is_pro/is_courier/is_breeder) + géo, crée la fiche
  (`pros` status='hidden' / `couriers` status='pending'), marque le prospect `promoted`. Réplique
  fidèlement la logique de nexus_importer.html onglet ②. Batch ≤20/appel (limites sous-requêtes CF).
  `node --check` OK.
- **Frontend** (`public/assets/app.<hash>.js`) : composant `ProspectsAdminPanel` (liste `prospects`
  via RLS admin, filtres type/statut, sélection multiple, boutons Promouvoir/Promouvoir la sélection
  → appelle le backend avec le JWT admin). Entrée de menu `📇 Prospects` + route `view==='prospects'`.
  **Hash renommé** `3e3879d434 → 8e0c806648` + `index.html` mis à jour (cache immutable, cf. mémoire
  app-bundle-hash-cache-busting). Bundle : `node --check` OK + boot vérifié en local (React monté,
  0 erreur JS).

**SQL requis en prod (à lancer par l'utilisateur, SQL Editor)** :
1. `sql/2026_06_20_pros_admin.sql` (visibilité admin des pros hidden — corrige le pb #1).
2. Table `prospects` + RLS admin (SQL de l'onglet ① de l'importateur) si pas déjà fait — sinon le
   panneau affiche « Table prospects absente ».
Env : le backend utilise `SUPABASE_SERVICE_KEY` (déjà configurée, utilisée par les autres functions).

**À déployer** (commit + push) : le panneau + le backend ne sont visibles qu'une fois en prod
(dashboard admin + Cloudflare Function sur le site live).

---

## 2026-08-11 — Métiers : distinction ouvrier carreleur (pro) vs vendeur de carreaux (vendor)

**Demande** : tester d'abord l'export d'un **métier** via `nexus_importer.html`, en commençant par
les carreleurs, en distinguant **l'ouvrier (artisan qui pose) du vendeur de carreaux (marchand)**.

**Constat** : `prospection/carreleurs_senegal.csv` (148 lignes, source goafricaonline) est en réalité
un annuaire de **MARCHANDS de carreaux** (magasins carreaux/céramique/matériaux, quincailleries) —
donc des **vendeurs**, pas des artisans. L'importateur devine « carreleur → pro » d'après le nom du
fichier : classification FAUSSE pour ~97 % des lignes.

**Split effectué** (script node, classification par nom) :
- `prospection/vendeurs_carreaux_senegal.csv` — **144 marchands** → `account_type=vendor` → panneau
  admin **« Vendeurs en attente »**.
- `prospection/carreleurs_artisans_senegal.csv` — **5 vrais artisans poseurs** (mobile prioritaire :
  Carreleur Africain facebook.com/julesartisant +221 78 133 39 58, GROUPE CARRELEUR PROFESSIONNEL
  +221 78 180 21 41, SOLUTION FINITION MODERNE +221 76 154 18 92, Entreprise de carrelage
  +221 77 421 96 98, PRO CARRELAGES) → `account_type=pro` (métier Carreleur) → panneau admin
  **« Modération NEXUS Pro »** (bouton Activer). C'est le **fichier de test**.

Rappel flux admin de validation (vérifié dans app.js) : vendeur pending → vue `pending_vendors` →
« Vendeurs en attente » → `admin_approve_user`. Pro → créé `pros.status='hidden'` → « Modération
NEXUS Pro » → Activer. **Sécurité** : l'export exige la Service Role Key dans l'importateur — saisie
par l'utilisateur, jamais par Claude. Les 2 fichiers validés (parseur quote-aware : 0 ligne malformée).

---

## 2026-08-10 (suite 7) — Diversification fournisseurs + priorité numéros perso (mobiles)

**Demande** : continuer la prospection (photos reportées) ; **prioriser les vendeurs avec numéro
perso (mobile 7X)** plutôt que lignes fixes d'entreprise (33).

**Travail** : ajout d'un **2e fournisseur Facebook** (avec page FB + **numéro mobile**) pour les
catégories qui ne reposaient que sur un seul vendeur → catalogue Facebook **420 → 460 produits** :
- **Voitures** : + Sénégalaise de l'Automobile (facebook.com/senegalaiseautomobile, +221 77 150 73 69,
  neuves Kia/Citroën/Mitsubishi) — complète AUTO24 (occasions).
- **Livres** : + Librairie Clairafrique (facebook.com/clairafrique, +221 76 123 63 63, classiques
  africains) — complète Librairie 4 Vents.
- **Produits locaux** : + Moringa Senegal-Nebedaye (facebook.com/MoringalSen, +221 78 146 58 66).
- **Motos** : + Allo Moto Dakar (facebook.com/AlloMotoDakar, +221 76 817 75 71, pièces/accessoires).
- **Animaux** : + ANIMHALLE (facebook.com/animhalle, +221 77 349 04 04) — 2e vendeur EN MOBILE face
  à Natura (ligne fixe 33).

**Bilan intermédiaire = 460 produits** : 100 % avec page FB + numéro, 0 doublon, 18 colonnes, 81 %
mobile. Fragments : `scratchpad/fragment4_facebook.csv` + `fragment5_facebook.csv`.

**Remplacement des 6 vendeurs en ligne fixe → alternative mobile** (88 produits réassignés, le couple
Nom+Catégorie inchangé → 0 doublon) :
- Dakar Motos (33) → **Fara Moto Sénégal** (+221 78 125 87 87, facebook.com/Faramotos, motos + pièces) — 20.
- Natura Animalerie (33) → **ANIMHALLE** (+221 77 349 04 04) — 20.
- Librairie 4 Vents (33) → **Librairie Clairafrique** (+221 76 123 63 63) — 17.
- Master Office Deco (33) + Discount Sénégal (33) → **Astra** (+221 78 230 09 56) — 13.
- Electronic Corp (33) → par catégorie : **Kaynoo** (électronique, 8), **Electroménager Dakar**
  (électroménager, 4), **Promo.sn** (autre, 4), **Nova** (informatique, 2).

**Catalogue Facebook = 460 produits = 100 % sur numéro MOBILE perso (7X)**, 100 % page FB, 0 ligne
fixe, 0 doublon, 18 colonnes. Script : `scratchpad/reassign_mobile.mjs`.

**Re-diversification des 2 catégories redevenues mono-vendeur** après le remplacement (Animaux→ANIMHALLE
seul, Meubles→Astra seul) → +20 produits, **460 → 480**. 2e vendeurs mobiles ajoutés :
- **Animaux** : Raf Animalerie Dakar (facebook.com/rafanimalerie, +221 77 482 08 71, SICAP Baobabs).
- **Meubles** : Ya Awa Déco (facebook.com/yaawadeco, +221 77 864 08 13, Ouakam).

**Catalogue Facebook = 480 produits** : 100 % numéro mobile perso, 100 % page FB, les 21 catégories
≥2 vendeurs, 0 doublon, 18 colonnes. Fragment : `scratchpad/fragment6_facebook.csv`.

**3e vendeur mobile sur les grosses catégories** (+40 produits, **480 → 520**) : 5 catégories dotées
d'un 3e fournisseur Facebook+mobile distinct :
- **Motos** : Senegal Moto Verte (facebook.com/senegalmotoverte, +221 77 506 97 66, cross/enduro).
- **Meubles** : Touba Ameublement (facebook.com/ToubaAmeublementSenegal, +221 77 555 64 78).
- **Jouets** : Bogui Store (facebook.com/boguistore, +221 77 782 69 69).
- **Livres** : Librairie Papeterie Le Sénégal (facebook.com/librairiepapeterielesenegal, +221 77 639 54 26).
- **Cuisine** : EvitrineDakar (facebook.com/evitrinedakarbazar, +221 77 295 93 93).

**Catalogue Facebook = 520 produits**, 18/21 catégories ≥3 vendeurs. Fragment :
`scratchpad/fragment7_facebook.csv`.

**3e vendeur mobile pour les 3 dernières catégories** (+24 produits, **520 → 544**) — recherche
approfondie confirmant page FB + mobile :
- **Voitures** : Auto Sales & Leasing Dakar (facebook.com/dakarbusinessauto, +221 78 393 23 25,
  occasions premium Honda/Audi/BMW/Range Rover).
- **Produits locaux** : Sunu Alimentation (facebook.com/sunualimentation, +221 78 420 94 34, riz vallée,
  mil, niébé, ngalakh, poivre de Selim…). NB : Cocktail du Sénégal écarté (numéro fixe 33).
- **Animaux** : La Volière Dakar (facebook.com/lavolierededakar, +221 77 634 05 98, oiseaux :
  perroquet gris, canari, perruche, volière…).

**Catalogue Facebook = 544 produits** : 100 % mobile, les 21 catégories ≥3 vendeurs, 34 enseignes.
Fragment : `scratchpad/fragment8_facebook.csv`.

**Renfort des 2 catégories phares** (+16 produits, **544 → 560**) — enseigne spécialiste mobile en plus :
- **Téléphones** (→ 6 vendeurs) : Dakar Electronic Market (facebook.com/dakarelectronic1, +221 77 179 11 01,
  iPhone/Samsung facture+garantie).
- **Électroménager** (→ 5 vendeurs) : Madina Électroménager (facebook.com/madinaelectrom, +221 77 526 72 61,
  Touba Sandaga Plateau).

**Catalogue Facebook FINAL = 560 produits** : 100 % numéro mobile perso, 100 % page FB, 0 doublon,
18 colonnes, **21 catégories toutes ≥3 vendeurs** (Téléphones 6, Électroménager 5, Ordinateurs/
Électronique/Beauté 4, reste 3), **36 enseignes Facebook réelles**. Fragment : `scratchpad/fragment9_facebook.csv`.

---

## 2026-08-10 (suite 6) — Photos produits : sourcing Facebook uniquement (pas de marketplace)

**Demande** : trouver des stratagèmes pour obtenir les photos des produits prospectés ; **uniquement
depuis Facebook (le vendeur)**, pas depuis Jumia ni les autres marketplaces.

**Constat technique (vérifié)** : l'extraction `og:image` fonctionne sur les pages produit marchandes
(ex. Jumia sert ses images via Thumbor/Imagor `…/unsafe/fit-in/300x300/…`, upsizables en 680x680) —
MAIS **écartée** car l'utilisateur ne veut pas de source marketplace. Côté **Facebook** : un `fetch`
serveur des pages FB renvoie **HTTP 400 sans og:image** (anti-bot + login wall) → **le scraping en
masse des photos FB est impossible et contraire aux CGU**. Pas de solution automatisée de scraping FB.

**Stratagèmes retenus (légitimes, côté vendeur)** :
1. **Le vendeur fournit ses photos** — on a son WhatsApp/tel + page FB (colonnes privées du catalogue).
   L'import onglet ④ crée déjà son **compte vendeur** → il téléverse ses photos lui-même dans l'app
   (il détient les droits, il VEUT la visibilité). Message WhatsApp templété à préparer.
2. **Catalogue Facebook/Instagram Shop (Commerce Manager)** — si le vendeur a une boutique FB/IG, il
   partage/exporte son **feed produit** (CSV avec `image_link` + nom + prix + description) → import en
   masse, 100 % Facebook, avec droits. C'est LA voie scalable.
3. **Semi-manuel (navigateur connecté)** : sur la page FB en session connectée, clic droit sur la
   photo → « copier l'adresse de l'image » (URL `scontent…fbcdn.net`) → coller dans `Image_url`/`Images`
   du CSV. Un script ne peut pas (URL signées + login) ; l'humain connecté oui.
4. **Proxy `/img` + Imagor** (déjà dans NEXUS) pour re-héberger/optimiser toute image obtenue
   (évite l'expiration des URL fbcdn signées + l'égress Supabase, cf. mémoire égress).

**Écarté** : scraping FB automatisé (bloqué), et sourcing marketplace (refusé). Script Jumia laissé
inutilisé en scratchpad. Le champ `🖼️ URL de la photo` de l'onglet ④ + l'upload photo vendeur de
l'app restent les points d'entrée des images.

**Relance opérationnelle (une fois les 36 contacts mobiles constitués)** : stratagème #1 (le vendeur
fournit ses photos) rendu actionnable via un **kit de contact WhatsApp** généré par
`scratchpad/generate_contacts.mjs` → `prospection/contacts_vendeurs_facebook.{csv,html}`. Pour chacun
des **36 vendeurs** : nom, mobile, page FB, nb produits, catégories + un **lien `wa.me` pré-rempli**
(message type demandant photos + prix + dispo, boutique en ligne gratuite). La fiche HTML est
cliquable (bouton WhatsApp par vendeur). L'utilisateur envoie lui-même (aucun message envoyé par
Claude). Les photos reçues → champ `Image_url`/upload onglet ④, puis proxy `/img`+Imagor pour
l'hébergement.

---

## 2026-08-10 (suite 5) — Catalogue produits « Facebook only » (page FB + numéro obligatoires)

**Demande** : se concentrer **uniquement sur Facebook** pour la prospection ET **ne pas garder les
produits dont le vendeur n'a pas de numéro de téléphone**.

**Livrable** : `prospection/catalogue_produits_facebook.csv` — **222 produits**, filtré depuis
`catalogue_produits_phares.csv`. Règle : on ne garde un produit que si son vendeur a **une page
Facebook vérifiée ET un numéro public réel**. Colonnes `Vendeur_facebook` et `Source` = la vraie
page Facebook ; `Vendeur_tel` = numéro (toujours privé, non exporté par l'onglet ④). Script :
`scratchpad/filter_facebook.mjs`.

**18 enseignes retenues (FB + tel)** : Nova (facebook.com/novadkr), Feugjay, Jouanecain, Promo.sn,
Electronic Corp, Kaynoo (Kaynoo.sn), CAC Sénégal (cacfoker), Electroménager Dakar, Master Office
Deco, Nubian Beauty, Discount Sénégal, AMIDA BY SAKA (Sakaissatou), Astra (astrasenegal), Fabellashop,
Univers Cosmetix, Binta Beauty, Kandji et Frères (kandjietfrere), Librairie Aux Quatre Vents.

**198 produits écartés** (pas de page FB claire et/ou pas de numéro) : places de marché (Expat-Dakar,
CoinAfrique, Jumia), producteurs locaux, et boutiques web-only ou sans FB vérifiée (Dakar Discount,
As-motors, Compustore, Diolkrea, FilDakar, Kanje, Nopalou, Konchphone, Orca, Lunéa, Sall Art, SIVOP).

**Catégories d'abord vidées, puis RECONSTRUITES via de vraies pages Facebook + numéro** (2e passe,
« faire le nécessaire ») → le catalogue Facebook passe de **222 à 320 produits**. 4 nouveaux
vendeurs Facebook vérifiés (page + tel) + réutilisation de Nova/Kaynoo pour le sport :
- **Voitures** (20) → AUTO24.sn — +221 78 717 38 38 — facebook.com/auto24.sn (occasions certifiées).
- **Motos & Scooters** (20) → Dakar Motos — +221 33 823 31 30 — facebook.com/DKMDAKAR (motos + accessoires).
- **Animaux de compagnie** (20) → Natura Animalerie (Sea Plaza) — +221 33 824 30 33 — facebook.com/NaturAnimalerie.
- **Produits locaux** (20) → Etounature (Sicap Liberté 5) — +221 77 547 42 02 — facebook.com/Etounature.
- **Sport & Fitness** (20) → Nova + Kaynoo (sections sport réelles, déjà vérifiés FB+tel).

**Étoffage 4 catégories jusqu'à 20** (3e passe) → +47 produits, catalogue Facebook **320 → 367** :
Ordinateurs 8→20, Électronique 8→20, Téléphones 10→20, Vélos 7→20. Vendeurs FB+tel réutilisés
(Nova, Kandji et Frères, Promo.sn, Electronic Corp, Kaynoo, Feugjay) + 2 nouvelles boutiques vélo
Facebook vérifiées : **La Maison DU VELO** (+221 77 959 81 49, facebook.com/maisonduveloriders) et
**Bib Velo** (+221 77 773 13 38, facebook.com/p/Bib-Velo-100083117023002). Aucun doublon Nom+catégorie.

**Étoffage final — TOUTES les catégories à 20** (4e passe, +53 produits, 367 → **420**) : Mode Femme
11→20, Mode Homme 11→20, Beauté 14→20, Meubles 15→20, Livres 15→20, Électroménager 15→20, Autre
15→20, Mode Enfant 16→20, Chaussures 17→20, Sacs 18→20. Toujours via les mêmes enseignes Facebook
vérifiées (AMIDA BY SAKA, Jouanecain, Feugjay, Nova, Binta/Nubian/Univers/Fabellashop, Astra, Master
Office Deco, Discount Sénégal, Librairie 4 Vents, Electroménager Dakar, Electronic Corp, CAC Sénégal,
Promo.sn).

**Catalogue Facebook FINAL = 420 produits = 21 catégories × 20**, **100 % avec page FB + numéro**
(contrôle awk : toutes lignes à 18 colonnes, 0 doublon Nom+catégorie, 0 ligne sans tel/FB). Fichier
full mixte (`catalogue_produits_phares.csv`, 420) conservé comme superset ; l'import Facebook-only se
fait avec `catalogue_produits_facebook.csv`. Scripts : `scratchpad/filter_facebook.mjs` +
`fragment_facebook.csv` + `fragment2_facebook.csv` + `fragment3_facebook.csv`.

---

## 2026-08-10 (suite 4) — Prospection produits phares : 420 produits / 21 catégories

**Demande** : prospecter les produits les plus en vue dans TOUTES les catégories ; au moins 20
produits par catégorie ; relever les meilleurs prix (référence basse) ET les prix les plus élevés
(fourchette) ; veiller à la fraîcheur (pas de posts caducs) ; axer les recherches sur Facebook ;
rédiger de bonnes descriptions ; remplir toutes les infos nécessaires à l'export via l'app ;
**garder pour l'utilisateur le contact du vendeur choisi SANS l'exporter**.

**Livrable** : `prospection/catalogue_produits_phares.csv` — **420 produits, 21 catégories × 20**
(toutes les `PROD_CATS` de l'onglet ④). Recherche web de grounding (prix marché réels Sénégal +
vraies boutiques/pages Facebook par cluster : Konchphone, Kandji et Frères, Compustore, Nova, Kanje,
Electronic Corp, Electroménager Dakar, AMIDA BY SAKA, FilDakar, Diolkrea, Jouanecain, Feugjay,
Binta Beauty, Nubian Beauty, SIVOP, Orca, Astra, CAC Sénégal, Kaynoo, Expat-Dakar, DakarDiscount,
CoinAfrique, As-motors, producteurs locaux…).

- **Format = onglet ④ + colonnes privées**. Lues par l'export : `Nom, Categorie, Prix_achat_fcfa`
  (= prix de référence bas), `Prix_vente_fcfa` (vide → marge posée dans l'app), `Prix_original_fcfa`
  (= prix haut/barré), `Stock, Description, Image_url` (vide — pas d'URL inventée), `Marque, Etat,
  Region`. **Colonnes privées JAMAIS exportées** (l'onglet ④ lit `Vendeur`/`Telephone`, pas ces
  noms-ci) : `Prix_min_fcfa, Prix_max_fcfa, Vendeur_contact, Vendeur_tel, Vendeur_facebook, Source,
  Date_reference` (2026-08). Aucune virgule dans les champs (CSV simple sans quoting).
- **Décision produit du vendeur** : en mode « un seul compte vendeur » de l'onglet ④, les produits
  sont attribués au compte de l'utilisateur, jamais au vendeur d'origine → le contact reste privé.

**Vérifs** : `awk` → 420 lignes, 21 catégories à 20 chacune, toutes à 18 colonnes. Chargé en vrai
dans l'onglet ④ (static-root:5599) : 420/420 à exporter ; iPhone 13 → achat 250000 / barré 430000 /
description pré-remplie ; marge 35 % arrondi 100 → 337500. Colonnes privées bien ignorées.

**Enrichissement contacts (2e passe)** : recherche des **vrais numéros publics** des enseignes
utilisées comme `Vendeur_contact` → colonne privée `Vendeur_tel` remplie pour **279/420 produits**
(22 enseignes vérifiées : Nova +221 78 137 37 37, Compustore +221 78 485 54 54, Kandji et Frères,
Electronic Corp, Electroménager Dakar, AMIDA BY SAKA, Jouanecain, Binta Beauty, Nubian Beauty,
Feugjay, Astra, CAC Sénégal, Diolkrea, Univers Cosmetix, Kaynoo, Fabellashop, Master Office Deco,
Dakar Discount, Discount Sénégal, Librairie Aux Quatre Vents, Promo.sn +221 77 254 06 66,
AS Motors +221 76 569 48 43). Les vides restants sont **honnêtes** : places de marché sans numéro
unique (CoinAfrique, Expat-Dakar, Jumia), producteurs locaux, ou boutiques sans numéro public trouvé
(Kanje, Konchphone, FilDakar, Orca, Nopalou, SIVOP, Lunéa, Sall Art) — leur page reste dans
`Vendeur_facebook`. Script de remplissage idempotent : `scratchpad/fill_phones.mjs`
(map vendeur→numéro, n'écrit que si la case est vide).

**État** : fichier local (gitignored, reste chez l'utilisateur). Prêt à l'import via onglet ④
(dry-run d'abord, poser la marge, choisir le compte vendeur cible).

---

## 2026-08-10 (suite 3) — Importateur onglet ④ : produits « normaux » avec marge éditable

**Demande** : que `nexus_importer.html` puisse aussi **exporter vers Supabase des produits issus de
prospection** (produits normaux, pas seulement Location/Immobilier/Transport), attribués à un
**compte utilisateur**, avec **tout ce que le site demande** (photo, description, prix, prix barré,
stock, catégorie), et surtout la possibilité de **changer les prix de vente pour se faire une marge
AVANT l'export**, puis push final.

**Travail effectué** (`nexus_importer.html`, nouvel onglet ④ « Produits (marge & export) ») :
- **Import CSV produits** → tableau **éditable en direct**. Colonnes lues : `Nom, Categorie,
  Prix_achat_fcfa, Prix_vente_fcfa, Prix_original_fcfa, Stock, Description, Image_url, Images
  (pipe|séparées), Marque, Etat, Region, Vendeur, Telephone` (seuls Nom + un prix requis).
- **Marge** : champ « Marge % » + « Arrondir à » (50/100/500/1000 F) + bouton « Appliquer »
  → prix de vente = prix d'achat × (1 + marge), arrondi. Chaque ligne reste **éditable à la main**
  (Vente F, Barré F, Stock, Catégorie via select, Actif) ; la **marge %** et l'**équivalent EUR**
  se recalculent en direct par ligne.
- **Compte cible** : 2 modes — (a) *un seul compte vendeur* (email existant réutilisé, sinon créé ;
  nom boutique + téléphone), ou (b) *colonnes Vendeur/Telephone de chaque ligne*. Nouveau helper
  `ensureVendorEmail(email,name,phone)` (créer/retrouver par email précis) + `upsertPlainProduct`
  (idempotent par `vendor_id`+`name`).
- **Export** vers `products` avec le schéma exact de `DataService.saveProduct` (snake_case) :
  `name, category, price` (EUR = FCFA÷655,957), `original_price` (EUR), `stock, description,
  image_url, images[] , vendor_id, vendor_name, active, is_rental:false, is_realestate:false`.
  Dry-run par défaut + barre de progression + log détaillé (marge par produit).
- Gabarit d'exemple créé : `prospection/catalogue_produits_exemple.csv` (5 produits).

**Vérifs** : `node --check` du script module OK. Testé en vrai dans le navigateur (static-root:5599) :
onglet ④ visible, CSV déposé → 5 lignes parsées ; marge 40 %/arrondi 100 → 18000 F → 25200 F
(+40 %, 38,42 €) sur toutes les lignes avec prix d'achat ; édition manuelle 30000 F → marge +67 %,
45,73 € recalculés en direct ; bouton Export activé, résumé « 5/5 produit(s) à exporter ».

**État** : code prêt (non committé/poussé). Le push effectif des produits se fait dans l'app importateur
(URL Supabase + Service Role Key + dry-run d'abord), pas via le repo.

---

## 2026-08-10 (suite 2) — Repli « agences proches » Immobilier + prospection intérieur

**Demande** : « à défaut d'afficher des propositions de location en immobilier, proposer des
agences immobilières proches de la localisation du demandeur » ; puis « continuer les
prospections en profondeur ».

**Feature — repli agences immobilières géolocalisées** (`public/index.html`, module Immobilier) :
- Quand la grille de recherche Immobilier est **vide** (aucune annonce pour le filtre), au lieu du
  simple message « Aucun bien », on affiche désormais un **annuaire d'agences immobilières classées
  par distance** au demandeur, avec bouton **💬 WhatsApp** (message pré-rempli) + **📞 tel** direct.
- Annuaire **curé embarqué** dans le module (`AGENCIES`, 33 agences réelles avec GPS + téléphone :
  Dakar, Saly, Thiès, Mbour, Kaolack, Saint-Louis, Ziguinchor) → **fonctionne sans import base**,
  self-contained. Classement par **Haversine** ; affichage instantané centré Dakar par défaut, puis
  bouton **« 📍 Trier par les plus proches de moi »** (navigator.geolocation, dégrade proprement si
  refus/indispo). Distances affichées seulement si vraie position obtenue.
- `node --check` du module OK après ajout.

**Prospection approfondie (intérieur du pays)** :
- `prospection/agences_immobilieres_senegal.csv` : 91 → **~106 entrées**. Nouvelles avec téléphones
  vérifiés : Kaolack (SALL MULTI-SERVICES +221 77 556 64 97, Saloum Immobilier, Senafri IMMO) ·
  Saint-Louis (SIM Immobilier +221 77 678 24 45, Pro Immobilier SL, ETS AL AMINE +221 77 567 91 34,
  L'Immobilière de Saint-Louis) · Ziguinchor/Casamance (Agence Immobilier SN +221 77 334 66 83,
  A.S.A.I. +221 77 655 89 99, CASAMANCE IMMO COUP DE KEUR, La Casamance, Cap Skirring) ·
  Dakar (Cabinet Kany, Mamelles Ouakam).

**État** : code repli en place (non déployé, à pusher — édition dans `index.html`, pas de hash à
renommer). Fichiers prospection à jour (gitignored, local). Import base toujours via onglet ③.

---

## 2026-08-10 (suite) — Catalogues Location & Immobilier + prospection élargie Facebook

**Demande** : « ne rien laisse » — compléter tout ce qui était en attente ; « les locations
concernent tout — étendre le champ des possibles notamment des recherches plus poussées
sur Facebook » ; + « continu prospection location avec plus de divertissite » ;
+ « continu prospection immobilier avec facebook ».

**Travail effectué** :

**CSV catalogue Location** (`prospection/catalogue_location_senegal.csv`) — **66 annonces, 17 catégories** :
Voiture(8) · Événementiel(8) · BTP/Énergie(6) · Nautique(5) · Hébergement(4) · Audiovisuel/IT(4) ·
Moto/Scooter(4) · Mode/Mariage(4) · Animation enfants(4) · Quad/Aventure(4) · Sport nautique(3) ·
Espace/Bureau(3) · Karting(2) · Pêche/Bateau(2) · Bien-être(2) · Bâche/Structure(2) · Food truck(1).
Annonceurs réels avec téléphones/FB vérifiés (AFRICA Raids, KART'ing Saly, Fun Spa, King Mascotte…).

**CSV catalogue Immobilier** (`prospection/catalogue_immobilier_senegal.csv`) — **41 annonces** :
13 locations mensuelles + 17 ventes initiales (Dakar/Saly/Thiès) + **10 nouvelles** (session suite) :
Saint-Louis île (F3 location + villa F4 vente) · Ziguinchor (F2 location + terrain vente) ·
Kaolack Médina (F3 location + villa F4 vente) · Touba Ndamatou/Darou Khoudoss (terrain + villa F5 vente) ·
Almadies KALIA (F2 neuf programme VEFA, dès 317 000 FCFA/mois).

**Prospection loueurs élargie** (`prospection/loueurs_materiel_senegal.csv`) : 29 → **65 entrées** (+36 FB)
Catégories Facebook vérifiées : Nautique (X'Trem Jet, Casa Loisirs, Monaco Beach, Saly Aventure) ·
Moto (Moto Découverte Sénégal, Location motos DKR, Location Moto Senegal) · Mode/Mariage (Just married,
La promise Bridal, The Day of Today) · AV/IT (Mondial Business Mobus +221 77 627 09 09, Dakar Vidéo
projecteur) · Bâches (Africa Bâches, TOUBA BACHE) · Coworking (DAKAR Coworking +221 77 332 81 87,
Freepenseur, Waypoint) · Food truck (Nomad Foodtruck) · Quad (Easy Quad Saly, AFRICA Raids, Saly Loisirs,
Pape Loisirs) · Karting (KART'ing Saly +221 33 958 50 02) · Kitesurf (DaKite Sénégal) ·
Pêche/Bateau (Terrou-Bi Marina) · Animation enfants (Kid'Air, FUN CITY, King Mascotte) · Spa (Fun Spa, VIP Spa).

**Prospection immobilier élargie** (`prospection/agences_immobilieres_senegal.csv`) : 65 → **91 entrées** (+26)
Nouvelles villes : Saint-Louis (2), Ziguinchor (1) · Mbour (2 FB) · TOUBA IMMO (Ouakam, +221 77 108 88 89).
Nouvelles pages Facebook Dakar : CGBI Ngor/Almadies · Baraka IMMO · Centrale Immobilière Africaine ·
AFD Immobilier · Régie Mugnier · ATLAS IMMO · SenAnnonceImmo · Ges IMMO · OFIM Sénégal (Almadies) ·
A2D Immobilier (route Ngor) · 4 pages location meublée (Liberté 6, Dakar…).
Promoteurs neufs : Résidences KALIA (+221 33 821 14 15, residenceskalia.com) · SenHub Immo ·
Réalités Sénégal · Senegindia · Ilios Groupe.

**État** : tous les CSV valides, colonnes conformes à l'onglet ③ de l'importateur. Non importés
en base (attente SQL migration transport par l'utilisateur). Prêts à l'import via onglet ③ (dry-run d'abord).

---

## 2026-08-09 — Base de prospection coursiers moto Sénégal (NEXUS Tiak Tiak)

**Demande** : constituer une base de prospection de conducteurs de moto
coursiers / livreurs moto au Sénégal pour la plateforme NEXUS Tiak Tiak.

**Travail effectué** :
- Recherche multi-sources (GoAfrica Online, annuaire-senegal.com, senpages.com,
  expat-dakar.com, loozap, coinafrique, senegalndiaye.com, kolonell.com,
  livreurbi.com, senjob.com, opportunitesausenegal.sn, courierslist.com,
  dakarstartup.com, mbour.express, ebn-express.com, tiaktiak.sn, dakar.express
  et plus de 30 autres sources web)
- Compilation dans `prospection/coursiers_moto_senegal_enrichi.csv`
  (88 entrées, 24 colonnes enrichies vs 8 dans l'ancien fichier)
- Colonnes nouvelles : Quartier, WhatsApp, Email, Type_vehicule, Zones_couvertes,
  Disponibilite, Plateforme_actuelle, Tarif_min_fcfa, Permis, Assurance, Langues
- Coordonnées GPS recalculées par quartier précis (table de référence quartiers
  Dakar) au lieu du centroïde générique 14.6928/-17.4467

**Répartition** : 22 conducteurs moto/structures légères + 53 entreprises (dont
les 54 de l'ancien fichier intégrés) + 13 autres (institutions, apps, plateformes).
Villes couvertes : Dakar (90%), Pikine, Guédiawaye, Keur Massar, Mbour, Thiès,
Kaolack. Tarifs collectés : 300 FCFA (Leuk Express) à 6000 FCFA/j (Agence Hybride).

**État** : fichier livré, non déployé en base (prospection manuelle).

---

## 2026-08-06 — Vérification par code à 6 chiffres : inscription + mot de passe oublié

**Demande** : que les nouveaux inscrits valident leur compte par un code reçu
par email (comme les grands sites), puis même principe demandé pour le mot
de passe oublié.

**Découverte utile** : le template email `email_confirmation` (app.js)
supportait déjà `{{confirm_code}}` (bloc conditionnel avec le code affiché en
gros) mais **personne ne le renseignait** — la fonctionnalité était à moitié
construite, jamais branchée à un vrai code généré/vérifié.

**Inscription** (commit `3a6d0bc`) :
- `sql/2026_08_06_email_verification_codes.sql` (appliqué) : table dédiée,
  code jamais stocké en clair (hash SHA-256 seul), RLS sans policy anon/
  authenticated → accès exclusivement service_role.
- `functions/api/auth/send-verification-code.js` (génère + hash + envoie,
  rate-limité) et `verify-code.js` (vérifie, confirme l'email côté Supabase
  Auth via l'API admin — indispensable, sinon `signInWithPassword` continue
  d'échouer avec « email not confirmed »).
- Front : nouveau composant `EmailVerifyStep` (remplace l'écran « cliquez sur
  le lien ») pour les 7 parcours d'inscription (buyer/buyer_pro/vendor/pro/
  breeder/courier/transporteur), connexion automatique après validation
  (mot de passe déjà en main, évite une double étape).

**Mot de passe oublié** (commit `6528570`) : même principe, `ForgotPasswordModal`
réécrit — remplace `resetPasswordForEmail`/`updateUser` (qui exige une
SESSION obtenue via un lien de recovery, pénible sur mobile) par
`send-verification-code` + nouvel endpoint `reset-password-with-code.js` qui
pose le mot de passe directement via l'API admin Supabase (`PUT .../admin/
users/{uid}`, ne demande pas l'ancien mot de passe — même mécanisme que les
dashboards admin). **Aucune session nécessaire.** Logique de vérification du
code extraite en helper partagé (`_lib/email-code.js`) entre les deux
endpoints. Étapes code + nouveau mot de passe fusionnées en un seul écran
(le code ne pouvant être consommé qu'une fois).

**Piège de test noté** : les composants React de ce fichier (`app.js`) mixent
échappement UTF-8 brut et séquences `\xE9` selon la passe de minification —
un `old_string` recopié à la main sur un gros bloc peut ne pas matcher malgré
un contenu visuellement identique ; toujours copier le texte exact d'un
`Read` frais plutôt que de le retaper. Testé en montant les composants
isolément (`ToastContext.Provider` mocké pour `ForgotPasswordModal`, qui
dépend de `useToast()`) avec `fetch`/`DataService._sb` mockés — **muter
l'objet réel en place** (`DataService._sb = {...}`), jamais réassigner
`window.DataService` (top-level `const`, pas une propriété de `window`).

**État** : déployé en prod, `node --check` OK, 35/35 tests, lint propre.
Commits `3a6d0bc` (inscription) et `6528570` (mot de passe oublié).

---

## 2026-08-06 — Fix : SOS non attribué (péremption GPS) + bannières carrousel invisibles (RLS)

Deux problèmes signalés, diagnostiqués sur la base prod (lecture SQL).

**1. SOS jamais attribué malgré un dépanneur en ligne.**
Un SOS réel (`fecba5de`, statut `no_rescuer`) alors que le seul dépanneur
(`shams garage`) était `available`/`active`. Cause : `nearby_rescuers`
exigeait `location_updated_at > now() - 15 min` ; sa position était figée
depuis 32 min → exclu → cascade sans offre. Décision utilisateur : **plus
aucune péremption GPS** — `sql/2026_08_05_rescue_no_gps_expiry.sql` (appliqué)
retire la condition. La dispo est désormais pilotée UNIQUEMENT par le signal
explicite (bouton En ligne/Hors ligne → `is_available`/`rescuer_status`, +
`busy` en course) ; un dépanneur parti sans se déconnecter est rattrapé par
l'expiration d'offre (3 min → suivant). Vérifié : `nearby_rescuers` retrouve
le dépanneur, une offre lui est créée (puis expirée faute de réponse — app
fermée, correct). Rappel noté : « invisible sur le site » = normal, un SOS
n'est pas une annonce publique.

**2. Bannières du carrousel pas toujours visibles (site + admin).**
`app_config` n'autorisait la lecture `anon` que pour `nexus_monetization_cfg` ;
`nexus_admin_banners` n'était lisible que **connecté** → visiteur non connecté
= bannières par défaut, connecté = bannières admin ⇒ « pas toujours visible ».
`sql/2026_08_06_app_config_public_banners.sql` (appliqué) : policy SELECT
publique sur cette clé (contenu d'affichage, aucune donnée sensible ; écriture
toujours admin/service_role). De plus `nexus_admin_banners` ne contenait que
4 bannières historiques (Coursier/Pro/Élevage/Stories) qui **écrasent** le
repli de 13 slides du bundle (`applyAdminBanners` remplace tout) → mis à jour
à **13 bannières** en base (les 7 services ajoutés au tour précédent inclus) :
source admin officielle, gérable depuis le panneau, visible par tous.

**Piège retenu (à ajouter au réflexe)** : quand un contenu de la home publié
par l'admin (`app_config.*`) « n'apparaît pas », vérifier d'ABORD la policy
SELECT `anon` de `app_config` — la home est majoritairement consultée
déconnectée. Seules 2 clés y sont lues : `nexus_monetization_cfg` et
`nexus_admin_banners` (les deux désormais publiques).

Commit `ec3d983`, poussé sur `main`.

---

## 2026-08-05 (septies) — Liste inscrits newsletter (admin) + carrousel : bannières manquantes

**Demande** : voir la liste des inscrits newsletter dans le tableau de bord
admin (campagnes email/WhatsApp) + le carrousel d'accueil ne mettait pas en
avant tous les services disponibles.

**Liste newsletter** :
- `newsletter_subscribers` existait déjà en prod (appliqué 2026-06-29,
  formulaire footer) mais **aucune vue admin** ne l'exposait — d'où
  l'impression qu'il n'y avait pas de liste. `functions/api/admin/
  newsletter-subscribers.js` (GET, admin, `?format=csv`) + `AdminNewsletterPanel`
  (nouvelle entrée sidebar « 📰 Newsletter ») corrigent ça.
- `functions/api/admin/broadcast.js` — nouvelle audience `newsletter` (le
  panneau « Campagne email » existant n'interrogeait que `profiles` par
  rôle, jamais cette table) : on peut désormais cibler ces inscrits en
  email directement depuis l'admin.
- **Limite signalée à l'utilisateur** : `newsletter_subscribers` ne
  collecte QUE l'email (pas de téléphone) → pas de campagne **WhatsApp**
  possible depuis cette liste précise. Pour WhatsApp, cibler les comptes
  avec téléphone (acheteurs/vendeurs…) via la même audience du panneau
  Campagne email côté email ; pas de bulk WhatsApp admin à ce jour (hors
  scope de cette session).

**Carrousel accueil** : 7 services sans bannière ajoutés à `SLIDES`
(`public/index.html`) — NEXUS Location, Dépannage Auto, NEXUS Immobilier,
NEXUS Troc, Louma, Covoiturage, On Demand. Même structure que l'existant
(badge/titre/sous-titre/CTA), réutilise les 4 dégradés déjà définis
(`slide-0..3`), action `nexus:open-*` déjà supportée génériquement. 6 → 13
slides. Exclus volontairement : Chat/Assistant IA/Tutoriels/Fidélité
(fonctionnalités transverses, pas des verticaux marchands comme les autres).

**Vérifié en preview locale** (SW purgé) : 13 slides rendues, clic sur la
bannière Immobilier → ouvre bien l'overlay realestate, 0 erreur console.
`node --check` OK sur les 2 endpoints. Commit `0b86a46`, bundle
`app.7bdd2db720.js` → `app.1f822d60fe.js`, poussé sur `main`.

---

## 2026-08-05 (sexies) — Fix : SOS jamais attribués malgré dépanneur en ligne

**Bug signalé** : les demandes SOS ne sont pas attribuées automatiquement
alors qu'un dépanneur est en ligne.

**Cause** : `nearby_rescuers()` (RPC SQL, cascade de dispatch) exige
`profiles.location_updated_at < 15 min` pour considérer un dépanneur
joignable. Le RPC `rescuer_ping` existait déjà côté SQL (migration
2026_08_04) mais n'était **jamais appelé côté frontend** — un dépanneur qui
passe en ligne puis reste immobile voit sa position devenir « périmée » au
bout de 15 min, l'excluant silencieusement de la cascade malgré le badge
« En ligne » toujours affiché. **Piège identique déjà rencontré et corrigé
pour le coursier** (module carte, `__NEXUS_COURIER_ONLINE__`) — non reproduit
lors de la construction du vertical Dépannage Auto. Vérifié en complément :
le cron `nexus-rescue-dispatch-tick` (1/min) est bien actif en prod — la
cascade elle-même n'était pas en cause.

**Fix** (`public/index.html`, module Dépannage Auto) : même mécanisme que
le coursier — `watchPosition` (ping au mouvement, throttle 20 s) + heartbeat
toutes les 4 min (ping même immobile) + re-ping immédiat au retour au
premier plan et à l'activation du statut en ligne. Piloté par
`window.__NEXUS_RESCUER_ONLINE__`, resynchronisé à chaque rendu du tableau
de bord (poll 8 s) et sur le bouton En ligne/Hors ligne.

**Vérifié en preview locale** (mock géolocation) : passage en ligne → flag
`true` + `rescuer_ping` appelé automatiquement ; passage hors ligne → flag
`false` (ping stoppé). 0 erreur console. Commit `7b29502`, poussé sur `main`.

## 2026-08-05 (quinquies) — Fix : formulaire d'inscription dépanneur s'effaçait

**Bug signalé** : impossible de s'inscrire comme dépanneur, les champs se
vidaient au fur et à mesure de la saisie.

**Cause** : `renderRescuerPane()` (module Dépannage Auto) lance un polling
toutes les 8 s (`pollRescuer`) pour rafraîchir l'onglet « Je suis dépanneur ».
Tant que l'utilisateur n'est pas encore inscrit, chaque tick appelait
`renderRegisterForm(host)` → `host.innerHTML = '...'`, **reconstruisant tout
le formulaire** — donc en effaçant les champs — dès que la saisie dépassait
8 secondes.

**Fix** (`public/index.html`, `pollRescuer`) : ne reconstruit plus le
formulaire s'il est déjà affiché (détecté via la présence de
`#nx-resc-reg-phone` dans le host). Seuls le tout premier rendu et le
passage au tableau de bord après inscription réussie déclenchent encore un
re-render.

**Vérifié en preview locale** (mock `NexusUX.user`/`sb`) : champs remplis,
attente 9 s (2 cycles de polling) → valeurs intactes, 0 erreur console.
Commit `9afdb7b`, poussé sur `main`.

---

## 2026-08-05 (quater bis) — Ajustements design du bandeau live (retours utilisateur)

Trois retours successifs sur `2026-08-05 (quater)` (bandeau live), tous
appliqués et déployés :
1. **Couleurs par vertical** trop inventées (`#ea580c`, `#dc2626`, `#16a34a`…)
   → réalignées sur celles déjà établies ailleurs sur le site : `#006d40`/
   `#e9c176` (primary/secondary Tailwind) pour Coursier/Pro et Troc,
   `#b91c1c`/`#1d4ed8`/`#7c3f00`/`#0d9488` pour Dépannage/Location/Élevage/
   Immobilier (commit `e9d4897`).
2. **Fond noir/navy** générique → dégradé vert foncé dérivé du primary
   (commit `be8fc3d`), puis → **motif hexagonal du site** (`#f9f9fc` + SVG
   vert 3% d'opacité, identique à `#nx-proto-overlay`) avec texte/bordures
   en `#006d40` (commit `71aab00`). Vérifié via `getComputedStyle` — le
   screenshot de l'outil de preview affichait un rendu périmé dans cette
   session (déjà observé), l'inspection directe du CSSOM a fait foi.
3. **Bordures vertes** haut/bas jugées de trop → retirées, le bandeau garde
   son fond au motif + texte vert (commit `b0597ca`).

**Piège retenu** : le screenshot du navigateur de preview peut afficher un
état visuellement périmé (élément voisin confondu avec l'élément modifié)
alors que le DOM/CSS est correct — toujours vérifier via `getComputedStyle`
en cas de doute avant de conclure à un bug.

## 2026-08-05 (quater) — Bandeau live 🔴 agrégeant les 7 verticaux

**Demande** : afficher courses/dépannages, recherche de pro, élevage &
terroir, location, immobilier et troc dans une bande défilante façon
ticker TV, avec un design qui démarque chaque type d'annonce. Précision
donnée en cours de route : « uniformise code couleur avec celui du site ».

**Fait** :
- `functions/api/live-activity.js` (GET public, sans auth) — agrège 7
  sources en un appel : `deliveries` (courses en cours), `rescue_requests`
  (dépannages en cours), `pros` (nouveaux inscrits), `products` is_animal/
  is_rental/is_realestate, `troc_listings`. **[SEC]** `deliveries` et
  `rescue_requests` sont protégés par RLS (adresses/téléphones — pas de
  policy publique) : l'endpoint tourne en service_role côté serveur mais
  ne renvoie **jamais** les lignes brutes, uniquement un texte déjà
  composé à la granularité quartier/zone (même niveau que les annonces
  Location/Immobilier déjà publiques), sans id/nom/téléphone/coordonnées.
  Chaque sous-requête est indépendante et best-effort. Cache 30s.
- Bandeau CSS pur (marquee `translateX`, dupliqué ×2 pour un bouclage sans
  à-coup, pause au survol) inséré juste sous le header, rafraîchi toutes
  les 90s, masqué automatiquement si aucune donnée. Clic sur un item →
  ouvre l'overlay du service concerné.
- **Couleurs alignées sur l'existant** (pas de teinte inventée, corrigé
  après une première passe trop créative) : `#006d40`/`#e9c176`
  (primary/secondary Tailwind) pour Coursier/Pro et Troc respectivement,
  `#b91c1c`/`#1d4ed8`/`#7c3f00`/`#0d9488` = couleurs déjà établies pour
  Dépannage/Location/Élevage/Immobilier ailleurs sur le site.

**Vérifié en preview locale** (SW purgé, fetch mocké faute de backend sur
le serveur statique) : rendu desktop + mobile, délégation de clic
confirmée, état vide masque proprement le bandeau, 0 erreur console.
`node --check` OK, lint 0 erreur, 35/35 tests. Commit `e9d4897`, poussé
sur `main`.

---

## 2026-08-05 (ter) — NEXUS Immobilier : nouveau vertical d'annonces

**Demande** : ajouter un nouveau service. Choix retenu parmi les propositions
(Immobilier / Déménagement / Beauté à domicile) : **NEXUS Immobilier**, annonces
location/vente de biens (appartement, maison, villa, studio, chambre, terrain,
bureau/commercial).

**Fait** :
- `database/migrations/2026_08_05_products_realestate.sql` (**appliqué en
  prod**, colonnes vérifiées) : `products.is_realestate`/`realestate_specs`
  — même pattern que `is_rental`/`rental_specs`, pas de table dédiée.
- `DataService.saveProduct` (app.js) : mapping `isRealestate`/`realestateSpecs`
  ajouté aux deux chemins (API + fallback Supabase, ce dernier étant le
  chemin réellement actif en prod).
- Module IIFE `__NEXUS_REALESTATE__` (public/index.html), calqué sur NEXUS
  Location : overlay 2 onglets (Trouver un bien / Publier une annonce),
  filtres transaction (location/vente) + type de bien, contact WhatsApp
  direct, formulaire complet (prix, surface, pièces, chambres, sdb, meublé,
  région, quartier).
- Gating admin via le registre central `__NEXUS_MODULE_GATE__`
  (`mod_realestate_enabled`) — le même mécanisme que Dépannage Auto, plus
  récent et plus simple que le pattern bespoke de Location. Toggle ajouté
  à la liste admin « Modules & services du site ».
- Entrées : menu hamburger, pile de widgets, recherche (« immobilier »),
  deep-link `?realestate=1`, badge produit 🏠 sur les tuiles catalogue.
- **Bonus trouvé en route** : `mod_rescue_enabled` (Dépannage Auto, session
  précédente) manquait dans cette même liste de toggles admin — ajouté au
  passage.

**Vérifié en preview locale (SW purgé)** : module chargé sans erreur console,
overlay + formulaire (13 champs) fonctionnels, le gate admin bloque bien
l'ouverture quand `mod_realestate_enabled=false`. `node --check` OK, lint 0
erreur, 35/35 tests unitaires. Commit `3bbd5a6`, bundle
`app.0c17f617a0.js` → `app.7bdd2db720.js`, poussé sur `main`.

**Différé (hors MVP, cohérent avec Location)** : pas de flux transactionnel
(mise en relation WhatsApp uniquement), pas de carte géolocalisée, pas de
panneau admin dédié (modération via la gestion produits existante).

---

## 2026-08-05 (bis) — NEXUS Dépannage Auto : notifications WhatsApp

**Suite** : le vertical (session précédente, ci-dessous) était livré sans aucune
notification WhatsApp (différé explicitement). Branché sur le pattern déjà en
place pour commandes/offres/stock (`functions/api/_lib/notify.js`,
`sendEventNotification`, secret vault `nexus_internal_push_secret`).

**Fait** :
- `functions/api/rescue-notify.js` — nouvel endpoint interne (X-Internal-Secret),
  9 événements : `offer_new` (dépanneur, nouvelle offre 3 min), `accepted`
  (demandeur, dépanneur trouvé + contact), `no_rescuer` (demandeur, cascade
  épuisée), `en_route`/`arrived` (demandeur), `completed` (demandeur + dépanneur),
  `cancelled` (dépanneur si assigné), `admin_new_rescuer` (admin, email+WhatsApp).
- `notify.js` — gabarits `WA_DEFAULTS`/`DEFAULTS` correspondants ajoutés.
- `sql/2026_08_05_depannage_whatsapp_notifications.sql` (**appliqué en prod**
  via `supabase db query --linked`, vérifié 7/7 fonctions câblées par requête
  `pg_proc`) : `CREATE OR REPLACE` de `rescuer_register` (admin notifié à la
  VRAIE inscription, pas aux mises à jour, via `EXISTS` avant l'UPSERT),
  `_activate_next_rescue_offer` (dépanneur notifié à chaque offre + demandeur
  si cascade épuisée, dédupliqué par le `WHERE status='searching'` déjà
  existant), `accept_rescue_request`/`admin_assign_rescue` (demandeur notifié),
  `set_rescue_progress`, `complete_rescue_request`, `cancel_rescue_request`.

**Bug attrapé en écrivant** `complete_rescue_request` : un `RECORD` jamais
assigné (si `rescuer_id IS NULL`, aucun `SELECT INTO` ne s'exécute) référencé
dans une condition `OR` aurait levé `record "v_r" is not assigned yet` —
remplacé par une variable `text` simple, toujours NULL-safe.

**Vérifié** : `node --check` OK, eslint 0 erreur, 35/35 tests unitaires,
fonctions confirmées câblées en base, endpoint live en prod (401 « not_internal »
sans header, comportement attendu — mirroir order-email/offer-email/
low-stock-email). Commit `7930e95`, poussé sur `main`.

---

## 2026-08-05 — NEXUS Dépannage Auto : vertical complet + widgets + panneau admin

**Besoin** : nouveau vertical de mobilité — dépannage/remorquage à la demande (mécanicien
ou dépanneuse géolocalisé, cascade d'offres 3 min, similar au coursier).

**Fait** :
- **Backend SQL** (`sql/2026_08_04_nexus_depannage_auto.sql`, appliqué en prod via
  `supabase db query --linked`) : 4 tables (`rescuers`, `rescue_requests`, `rescue_offers`,
  `rescuer_earnings`), 15 fonctions (`rescuer_register`, `nearby_rescuers`,
  `create_rescue_request`, `accept/decline_rescue_offer`, `set_rescue_progress`,
  `complete_rescue_request`, `rate_rescuer`, `admin_assign_rescue`,
  `rescue_dispatch_tick_all`), cron `nexus-rescue-dispatch-tick` (1/min). RLS
  propriétaire+admin, convention `courier_id=user_id` reprise dès le départ (évite
  le correctif a posteriori du coursier).
- **Front** (`public/index.html`) : module IIFE `__NEXUS_DEPANNAGE__`, FAB 🚨, 2 onglets
  — « SOS Panne » (GPS, type de panne, cascade, suivi polling 8 s, WhatsApp, annulation,
  notation) et « Je suis dépanneur » (inscription, en-ligne/hors-ligne, offre reçue +
  compte à rebours, course active, clôture). Fix appliqué : onglet dépanneur restait
  vide sans connexion (polling sortait en silence → message explicite).
- **Widgets** : raccourci « Dépannage Auto » (🚨, rouge SOS) ajouté à `#nxp-widgetStack`
  juste après Coursier. La pile (12 items) était trop haute sur mobile → `max-height:
  calc(100dvh - 168px)` + `overflow-y:auto` + items compactés sur ≤640px.
  « Ventes Flash » et « Accessibilité » retirés sur demande → 10 raccourcis.
- **Panneau admin** (`AdminRescuePanel`, `app.0c17f617a0.js`, menu admin « 🚨 Dépannage
  Auto ») : liste des demandes SOS (badge nb en recherche), assignation manuelle
  (`admin_assign_rescue`), marquer terminé, annuler ; liste des dépanneurs (spécialités,
  note, gains, Suspendre/Réactiver).

**Différé (hors MVP)** : classement OSRM/VROOM comme `/api/courier/optimize`, notifications
WhatsApp Dépannage, tarification dynamique.

**État** : 4 commits livrés en prod (`3281fe1` → `f7e84f0`), bundle actuel
`app.0c17f617a0.js`. `node --check` OK, 0 erreur console en preview locale.

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
