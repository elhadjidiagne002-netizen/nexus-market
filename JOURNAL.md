# Journal du projet NEXUS Market

Historique chronologique (le plus récent en haut) de ce qui a été fait, pourquoi,
et où en est chaque chantier. Complète `CLAUDE.md` (référence technique/pièges,
non chronologique). Mis à jour après chaque session de travail avec Claude.

---

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
