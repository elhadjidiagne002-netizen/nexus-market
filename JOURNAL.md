# Journal du projet NEXUS Market

Historique chronologique (le plus récent en haut) de ce qui a été fait, pourquoi,
et où en est chaque chantier. Complète `CLAUDE.md` (référence technique/pièges,
non chronologique). Mis à jour après chaque session de travail avec Claude.

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
spécialisés, correctement cette fois, sans isolation worktree). **Rien
d'appliqué au code** — c'est un audit, pas une intervention ; le fix du filtre
`sitemap-listings.xml.js` est en tête de l'`ACTION-PLAN.md` mais reste à faire.

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
