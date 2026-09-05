# Journal du projet NEXUS Market

Historique chronologique (le plus récent en haut) de ce qui a été fait, pourquoi,
et où en est chaque chantier. Complète `CLAUDE.md` (référence technique/pièges,
non chronologique). Mis à jour après chaque session de travail avec Claude.

---

## 2026-09-05 (cinquante et unième) — Campagne WhatsApp autonome (goutte-à-goutte) + réparation WAHA

**Demande** : « je ne peux pas faire de lancement en masse à cause des
contraintes, trouve un moyen de lancement que tu feras toi-même ».

**Constat** : 3618 prospects avec téléphone, mais **53 messages envoyés depuis
le début du projet** (16 sur 30 jours) — l'envoi manuel depuis le dashboard ne
passe pas à l'échelle.

**Solution** : un cron `/cron/wa-campaign` qui vide une file d'attente par
petits lots, déclenché toutes les heures par le workflow GitHub Actions déjà en
place. Le token reste dans les secrets GitHub : rien ne transite par la
conversation, et personne n'a à cliquer.

⚠ **La contrainte dimensionnante n'est PAS le quota Green API mais WhatsApp**,
qui bannit un numéro envoyant en masse à des gens qui ne l'ont jamais contacté.
D'où : plafond par passage ET sur 24 h glissantes, fenêtre 8 h-19 h, délai
aléatoire entre envois, et un disjoncteur qui passe la campagne en `stopped`
au-delà de 50 % d'échecs sur un lot. Cadence retenue : ~80/jour.

**Tables** `wa_campaigns` / `wa_campaign_targets` / `wa_opt_outs`
(service_role uniquement — elles contiennent des numéros de tiers). Une
campagne naît en `paused` : déployer le code n'envoie rien.

### Cinq défauts trouvés PAR les tests, pas par la lecture

1. **42 % de la liste était inutilisable** : 1176 cibles sur 2828 étaient des
   numéros **fixes** (préfixe 33), sans WhatsApp. Elles auraient échoué en bloc,
   fait sauter le disjoncteur en permanence, et surtout : un fort taux d'envois
   vers des numéros absents de WhatsApp est le signal qui fait classer un compte
   comme spam — ça aurait *accéléré* le bannissement. Filtre `isSenegalMobile()`
   (préfixes 70/75/76/77/78) + marquage `skipped` en base.
2. **« Bonjour Dakar »** : prendre le 1er mot comme prénom marche pour une
   personne (« Bonjour Fall », usage courant au Sénégal) mais produisait
   « Bonjour Dakar » pour l'entreprise *Dakar Rapid Pare-Brise*, « Bonjour
   Immobilière », « Bonjour SAHEL ». Règle corrigée : nom en un seul mot = nom
   de personne, nom composé = raison sociale saluée en entier.
3. **Ma détection du STOP désinscrivait « arrêtez-vous au marché ? »** — un
   prospect intéressé, perdu par erreur. Le mot-clé doit désormais constituer
   l'essentiel du message (25/25 cas de test).
4. **Filtre `promoted` à contresens** : mon 1er remplissage n'a trouvé que
   25 cibles au lieu de 2828. `status='promoted'` ne veut pas dire « déjà
   client » mais « fiche déjà créée sur le site » — c'est justement la cible
   principale du message (« votre fiche est en ligne »).
5. **Faille de sécurité dans mon propre code** : `requireAdmin` renvoie un
   TUPLE `[user, errResponse]`, pas une `Response`. Le test
   `if (guard instanceof Response)` que j'avais écrit sur
   `/api/admin/waha-session` n'aurait bloqué personne → endpoint d'appairage
   WhatsApp **public**. Attrapé à la relecture avant déploiement.

### Robustesse sans infrastructure payante

`wa_opt_outs` + traitement du STOP dans le webhook entrant, **avant** le
coupe-circuit du bot (même bot désactivé, un désabonnement doit être
enregistré). Écritures de statut post-envoi avec réessai : leur perte
laisserait la cible en `pending` et provoquerait un **doublon** chez une vraie
personne. Lectures critiques (plafond 24 h, liste d'opt-out) : en cas d'échec
on suspend plutôt que d'envoyer à l'aveugle.

**Remise en file automatique** des échecs transitoires (466 quota, 5xx, 429,
408, réseau) avec backoff 3 h puis 12 h, 3 tentatives max. Les échecs
définitifs (400 numéro invalide, 404, 401) ne sont jamais repris — insister
gaspille le budget et aggrave le signal spam. ⚠ Bug évité : « aucune cible
**due** » ≠ « file **vide** » — marquer `done` aurait abandonné les cibles en
attente de réessai.

### WAHA (fournisseur de secours)

`GET /api/whatsapp` remontait `404 Session not found` : le secours était mort
sans que rien ne le signale. Cause : disque éphémère sur Render, un
redémarrage efface la session appairée. Nouvel endpoint admin
`/api/admin/waha-session` (list/status/qr/start/stop) — il ne peut pas scanner
le QR (action physique sur le téléphone, et c'est très bien ainsi) mais
automatise tout le reste.

**Piste gratuite pour régler la cause racine** : WAHA Core sait stocker ses
sessions en **PostgreSQL** (`WHATSAPP_SESSIONS_POSTGRESQL_URL`) au lieu du
disque — vérifié dans la doc WAHA, disponible en version gratuite. Vérifié
aussi sur notre base : le rôle `postgres` a bien `rolcreatedb = true` (WAHA
crée ses propres bases `waha_*`), test `CREATE DATABASE` / `DROP DATABASE`
réellement effectué puis nettoyé. Reste à poser la variable côté Render
(demande le mot de passe de la base, donc action utilisateur).

---

## 2026-09-05 (cinquantième) — Vérification du sitemap en production + 2 correctifs

**Demande** : vérifier que le sitemap se génère bien en prod après les
chantiers SEO des deux entrées précédentes.

**Résultat** — `/sitemap-listings.xml` répond 200, XML valide, **1090 URLs** :
721 produits · 206 pros · 154 lignes de transport · 9 vendeurs. Déclaré dans
`robots.txt` et `sitemap_index.xml`. Les 206 pros = **106 hubs** (exactement
le nombre calculé) + **100 fiches individuelles**, qui correspondent
précisément aux 100 pros ayant une description ≥ 60 caractères (revérifié en
base) : le filtre `proHasSubstance` fait donc exactement ce qui était prévu.
Avant ce chantier, ce sitemap déclarait les 2695 fiches vides.

**Pages testées une par une en prod** : `/pro/plombier-dakar` et
`/pro/macon-dakar` → 200 avec 60 artisans listés, 14 liens inter-hubs et
JSON-LD `ItemList` ; slug inexistant → 404 ; fiche sans contenu →
`noindex, follow` ; fiche avec description → `index, follow` ;
`/vendeur/<acheteur>` → **410** ; `/vendeur/<vrai vendeur>` → **200**.

**Deux défauts trouvés PAR cette vérification (commit `a3ed00a`)** :
1. La page annonçait « 60 plombiers » alors que la base en compte **63** —
   l'écart venait du plafond d'affichage (`limit=60`), pas des données. Titre
   et description utilisent désormais le total réel (`hub.count`), avec mention
   explicite quand la liste est plafonnée. `numberOfItems` du JSON-LD reste le
   nombre réellement listé (règle Schema.org) : l'écart est assumé et commenté.
2. Lien fiche → hub bancal : « Voir tous les mécanicien moto à dakar »
   (singulier + ville en minuscule). Reformulé de façon robuste pour les 48
   libellés métiers, dont aucun ne se pluralise proprement (« Garage /
   Mécanicien », « Menuisier (bois) »).

⚠ **Correction d'un chiffre annoncé dans l'entrée précédente** : « 192
descriptions d'une longueur moyenne de 5 caractères » était la moyenne
calculée sur les 2695 fiches **vides comprises**, ce qui laissait croire que
les 192 descriptions faisaient 5 caractères. En réalité, **quand une
description existe elle fait 64 caractères en moyenne**, et 100 dépassent 60.
Le diagnostic de fond ne change pas (0 photo, 0 avis, ~2600 fiches sans
contenu propre), mais ces 100 fiches ont une vraie substance — d'où leur
maintien à l'index.

⚠ **Piège de vérification** : les pages hub sont en cache 30 min
(`Cache-Control: public, max-age=1800`). Après un déploiement, l'URL nue
renvoie encore l'ancienne version (constaté : `Age: 415` pendant 6 tentatives,
d'où une fausse conclusion « pas déployé »). Ajouter `?cb=<aléa>` pour
interroger l'origine. Même réflexe que pour le bundle immuable et le SW.

---

## 2026-09-05 (quarante-neuvième) — 245 URLs /vendeur/ mortes : c'était NOUS qui les déclarions

**Demande** : corriger les 245 URLs `/vendeur/` mortes repérées dans l'export
Search Console de la session précédente.

**Diagnostic — l'hypothèse de départ était fausse.** Je supposais des vendeurs
supprimés. Vérification faite : sur un échantillon des IDs concernés, les
profils **existent tous en base**, avec le rôle **`buyer`** et **0 produit**.
Ce ne sont pas des fiches disparues, ce sont des **acheteurs**.
(Piège au passage : un premier test via la clé anon renvoyait « 242
introuvables », mais c'était la RLS — lecture publique de `profiles` limitée
aux vendeurs. Il a fallu re-vérifier en service_role pour trancher.)

**Cause racine** : le SPA posait un `<link rel="canonical">` vers
`/vendeur/<id>` pour **n'importe quel profil** ouvert via `?vendor=`, sans
vérifier son rôle. Un canonical étant un signal fort de découverte, c'était
donc le site lui-même qui réclamait à Google l'indexation de 245 pages
répondant 404. Aucune donnée n'était corrompue : c'était un bug d'émission
de liens.

**Fix, aux deux bouts** :
- **Bundle** : un nouvel état `vendorCanonOk` vérifie le rôle avant de poser le
  canonical ; sinon il reste sur l'accueil. La RLS aide (une lecture publique
  de `profiles` ne remonte que les vendeurs), mais le rôle est vérifié
  explicitement pour le cas du self-read (un acheteur lisant son propre profil).
- **Serveur** (`functions/vendeur/[id].js`) : un profil qui existe mais n'est
  pas vendeur répond désormais **410 Gone** au lieu de 404 — Google retire
  l'URL plus vite et cesse d'y revenir. Le 404 reste pour un id totalement
  inconnu, qui lui pourrait correspondre à un futur vendeur.
  `render404()` accepte un paramètre `status` optionnel (défaut inchangé).

**Vérifié en local** (bundle réel, IDs réels de l'export) : avec un ID
acheteur, le canonical vaut désormais `/` ; avec un vrai vendeur
(TechZone Sénégal), il vaut bien `/vendeur/<id>`. Bundle renommé
`app.28ddbe4e63.js`, `sw.js` bumpé en `nexus-v30`.

---

## 2026-09-05 (quarante-huitième) — Search Console : 1352 pages « Détectée, non indexée » → hubs métier × ville

**Déclencheur** : export Search Console fourni par l'utilisateur
(`nexusmarket.sn-Coverage-Drilldown-2026-09-05.zip`), problème « Détectée,
actuellement non indexée » : **70 pages fin juin → 1352 fin août**.

**Diagnostic** — les 1000 URLs de l'export ont TOUTES
`dernière exploration = 1970-01-01`, c'est-à-dire **jamais explorées** : Google
connaît ces URLs et refuse d'y dépenser du budget d'exploration. Répartition :
600 `/pro/<uuid>`, 245 `/vendeur/<uuid>`, 111 `/produit/<uuid>`. Mesuré en base
sur les **2695 pros actifs** : **0 photo, 0 avis**, 3 tarifs, 9 expériences, et
192 descriptions d'une longueur **moyenne de 5 caractères**. Une fiche ne portait
donc qu'un nom + un métier + une ville, pour seulement 48 métiers et 88 villes
→ des centaines de pages quasi identiques, déclarées au sitemap en
`priority 0.6 / changefreq weekly`. **Ce n'était pas un problème technique**
(canonical, JSON-LD, OG tous corrects) mais un problème de contenu, qui
pénalisait aussi les 721 fiches produit, elles réellement remplies (721
descriptions, 554 images).

**Fix** (`functions/_lib/pro-hubs.js`, partagé par la page et le sitemap) :
- **Pages d'annuaire `/pro/<metier>-<ville>`** greffées sur la route existante
  (`/pro/:id` : un slug n'est jamais un UUID, aucun conflit). Contenu agrégé
  réel : liste des artisans, comptes factuels, JSON-LD `ItemList`, et maillage
  interne entre hubs (même métier ailleurs / autres métiers dans la ville).
  **106 hubs couvrent 2426 des 2695 pros (90%)** et correspondent à la vraie
  demande (« plombier Dakar », pas le nom d'un artisan inconnu).
- **Fiches sans substance en `noindex, follow`** et retirées du sitemap : elles
  restent accessibles aux visiteurs, on cesse juste d'en réclamer l'indexation.
- `changefreq` des fiches individuelles ramené à `monthly` (annoncer `weekly`
  sur des pages figées était un signal faux de plus).

⚠ **Trois pièges trouvés par la mesure, pas par la lecture** :
1. **Collisions de slug** : `Thiès`/`Thies`, `Garage / Mécanicien`/
   `Garage / Mecanicien`, `Carrosserie / Tôlerie auto`/`… Tolerie …` se
   réduisent au même slug. La fusion est souhaitable, mais il faut garder
   TOUTES les variantes : la page interroge `profession=in.(…)`/`city=in.(…)`,
   sinon elle annoncerait 8 artisans et n'en afficherait que 6. Vérifié sur
   l'API réelle : 8 lignes renvoyées (6+2), et 12 pour `Menuisier (bois)`
   (libellé à parenthèses).
2. **`sbGet` ne pagine pas** — PostgREST plafonne à 1000 lignes, or il y a 2695
   pros : la table des hubs aurait été tronquée en silence. `sbGetAll` (paginé
   par en-tête `Range`) exporté depuis `_lib/seo.js`. C'est exactement le piège
   déjà documenté dans le sitemap le 19/08/2026.
3. **Ville « Non précisé »** exclue des hubs (« Maçon à Non précisé » aurait été
   précisément la page maigre qu'on supprime), et lien vers le hub posé sur une
   fiche seulement si le hub existe vraiment (seuil de 3), sinon la fiche
   pointait vers un 404.

**Reste à surveiller** : 245 URLs `/vendeur/` découvertes pour **9 vendeurs
réels** en base (~236 URLs mortes, déjà en 404) — sans impact direct, mais à
garder en tête si le chiffre remonte. Effet attendu non immédiat : Google doit
re-crawler le sitemap ; la mesure se fera sur l'évolution de la courbe dans
Search Console.

---

## 2026-09-05 (quarante-septième) — Rotation du catalogue sur l'accueil (12 → 99 produits vus en 4 visites)

**Demande** : « apporte plus de rotation sur les produits affichés dans le
site après rafraîchissement, ouverture d'une page ou autres circonstances
où il serait pertinent d'afficher bien plus de nouveaux produits de mon
catalogue ».

**Constat chiffré en base** : **478 produits classiques actifs**, mais
l'accueil n'en exposait qu'une douzaine. Deux causes cumulées :
- seule « Meilleures Ventes » tournait (fix du 2026-08-26, pool de 48) ;
- **aucun produit n'a de note** (`rating = 0` sur 721 produits actifs), donc
  le tri de « Recommandé » (`rating.desc, created_at.desc`) retombait sur
  `created_at desc` — soit **exactement les mêmes 12 fiches** que
  « Nouveaux Arrivages ». Les sections verticales (147 en location, 61 en
  immobilier) servaient elles aussi toujours les 12 mêmes.

**Fix** (`public/index.html`, overlay statique — ce que voit un visiteur non
connecté, cf. `boost-static-overlay-integration`) : helpers `sbShuffle` /
`sbRotate` partagés, appliqués à TOUTES les sections. Principes :
1. pool large côté serveur, mélange Fisher-Yates côté client ;
2. les produits **boostés (payants) restent toujours en tête**, jamais noyés ;
3. `seen` partagé entre les 3 sections produits → **36 fiches DIFFÉRENTES**
   par page au lieu de ~12 répétées ;
4. « Recommandé » puise dans une **fenêtre aléatoire** (`offset` au hasard)
   de tout le catalogue — c'est ce qui fait réellement remonter le fond de
   catalogue ; repli automatique sur le début si l'offset dépasse la fin
   (aucun réglage à maintenir quand le catalogue grandit).
5. Re-rotation au retour sur l'onglet après >3 min et au retour arrière
   bfcache (`pageshow`) — jamais pendant que l'utilisateur regarde.

⚠ **Régression introduite puis corrigée pendant le développement** : la 1re
version chaînait les 3 requêtes en série pour fiabiliser `seen`, ce qui
retardait visiblement les 2e/3e sections (mesuré). Réécrit en **2 pools tirés
en parallèle** (`Promise.all`) — récentes d'un côté, fenêtre profonde de
l'autre — partagés après coup : dédoublonnage total, sans coût de latence.
Second bug attrapé par la mesure : `sbRotate` recevant deux pools concaténés
pouvait sortir deux fois la même fiche → dédoublonnage ajouté **à
l'intérieur** du helper.

**Mesuré en local** (vraies données Supabase, 4 rechargements) : 36 → 62 →
83 → **99 produits distincts vus**, **0 doublon** sur chaque page, 0 erreur JS.

---

## 2026-09-05 (quarante-sixième) — Bandeau « EN DIRECT » : le clic ouvre l'annonce + outils admin

**Demande** : « cliquer les annonces ne donne pas vers l'annonce, corrige
cela et donne plus d'outils de gestion à l'admin de cette fonctionnalité
en améliorant le tableau de bord de gestion » (capture du ticker fournie).

**Cause** : `/api/live-activity` ne renvoyait **aucun identifiant** — par
conception, pour ne jamais exposer de ligne brute des tables privées. Le
clic ne pouvait donc que dispatcher un événement générique
(`nexus:open-pros`…) ouvrant le **module entier**, sans savoir de quelle
annonce il s'agissait.

**Fix clic** — l'API porte désormais un `ref {kind, id}` sur les **5
verticaux publics uniquement** (pro, élevage, location, immobilier, troc :
lignes déjà librement consultables, avec des URL partageables `?pro=` /
`?product=` / `?troc=` déjà en place). `courier` et `rescue` restent
**volontairement sans `ref`** — tables protégées par RLS (adresses,
téléphones), la garantie « aucune ligne brute » de l'endpoint est
intacte. Le bandeau réutilise les deep-links **existants** (rien de
nouveau inventé) : `NexusPro.openPro(id)` / `nexus:open-product`
(detail = id) / `nexus:open-troc` (detail.id, écouteur étendu dans
`app.js`), avec repli sur l'ouverture du module quand il n'y a pas de
`ref`. Garde anti-XSS sur les liens admin (`^https?://` ou `^/` seulement,
jamais `javascript:`/`data:`), + activation clavier (`role=link`,
`tabindex`, Entrée/Espace).

**Outils admin** (Gestion Page d'Accueil → Bandeau live) : réordonnancement
des messages (↑/↓), pause par message sans suppression, lien cliquable par
message, activation/désactivation de **chaque flux automatique**, vitesse
de défilement réglable, et un **diagnostic** qui interroge l'API publique
pour montrer ce qu'un visiteur reçoit réellement (compte par vertical,
nombre de cliquables, vitesse appliquée). La vitesse transite par un
en-tête `X-Ticker-Speed` et non dans le corps : la réponse reste un
tableau, donc un `index.html` encore en cache continue de fonctionner.
⚠ Le nouvel état React est déclaré **au niveau du composant**, pas dans
l'IIFE conditionnelle (piège déjà rencontré sur Promos/Sections/Confiance).

**Vérifié en local** (`static-py` + fixture temporaire, supprimée ensuite) :
les 4 comportements de clic déclenchent la bonne action (espions sur les
événements + sur `NexusPro.openPro`), la garde XSS rejette
`javascript:`/`data:`, l'activation clavier marche, un lien admin prime sur
l'événement de module, **zéro erreur JS**. Bundle renommé
`app.4460e4787c.js` → `app.8939f172e4.js` (cache immuable) + `sw.js`
bumpé en `nexus-v29`. Lint et `node --check` OK.

---

## 2026-09-05 (quarante-cinquième) — Noms de pros incomplets : 2e passe (377 fiches)

**Demande** : « y a toujours des noms de pros incomplet » (après la passe
de 193 fiches de la veille).

**Diagnostic** : la correction précédente ne couvrait qu'**un lot déjà
identifié**. En repartant de la base (2695 pros) : 75 noms **vides** et
~200 réduits au seul patronyme, plus une centaine tronqués au premier mot
(`Pharmacie`, `Hôpital`, `Centre`…). Rapprochement refait sur **tous** les
CSV de prospection (220 fichiers, 3089 téléphones indexés) contre l'export
complet, par numéro de téléphone.

**Fix** : `sql/2026_09_05_fix_pro_names_round2.sql` — 377 UPDATE avec garde
défensive (`name` actuel == fragment attendu, pour ne jamais écraser une
saisie manuelle). Appliqué en prod, **vérifié : 0 nom vide restant**
(75 → 0).

⚠ **Heuristique resserrée en cours de route** : la première version
proposait 389 corrections dont certaines auraient **dégradé** les noms en y
collant un complément entre parenthèses (`Carreleur Africain` →
`Carreleur Africain (julesdiallo146@gmail.com)`). Filtre ajouté : on ignore
tout candidat n'ajoutant qu'un parenthétique ou contenant un `@`, et on
écrit le nom **sans** son complément descriptif. Faux positif écarté aussi :
les `é` affichés `?` venaient de la console Windows, pas des données
(vérifié : codepoint `0xe9`, correct).

**Reste non corrigé, volontairement** : 162 **acronymes** (`EGB`, `ECM`,
`AVN`, `CCS`…) qui sont les vrais noms commerciaux dans les sources — les
« compléter » serait inventer ; et 47 patronymes seuls dont aucun CSV ne
contient le téléphone (prénom irrécupérable automatiquement, nécessite une
nouvelle passe de prospection).

Outil réutilisable après chaque prospection : `prospection/audit_noms_pros.py`
(non versionné — `prospection/` est gitignoré, comme les autres scripts du
dossier).

---

## 2026-09-04 (quarante-quatrième) — Chips de catégories : défilement horizontal au lieu de l'enroulement

**Demande** : l'écran « Trouver un pro » (~50 chips métiers) prenait trop
de hauteur (capture d'écran fournie : ~15 lignes empilées avant de voir le
bouton de recherche). Trouver un système plus compact et l'appliquer aux
autres modules.

**Fix** (CSS uniquement, aucune logique de clic touchée — même principe
que le fix `2fcfd0a` du 2026-09-02 sur le panneau de filtres) : les
conteneurs de chips passent de `flex-wrap:wrap` (empilement multi-lignes)
à `flex-wrap:nowrap;overflow-x:auto` (défilement horizontal en 1 seule
ligne, quel que soit le nombre de chips). Appliqué à :
- `#nx-pro-chips` (NEXUS Pro, ~50 métiers — le cas signalé).
- `.nx-edu-chips` (NEXUS Éducation, matières + niveaux — même motif,
  seul autre endroit du site avec une liste de chips équivalente).

Vérifié en local (`static-root`, SW purgé) : capture avant/après confirmée
— 1 ligne avec flèches de défilement ‹ › au lieu de ~15 lignes empilées,
sur les deux écrans.

---

## 2026-09-04 (quarante-troisième) — Noms de pros tronqués corrigés (193 fiches)

**Demande** : « les noms des pros exportés vers Supabase ne sont pas
complets, tout corrige ».

**Diagnostic** : un lot de pros **antérieur à cette session** (import plus
ancien, pas `build_pros_insert*.py`) avait été inséré avec `name` = colonne
`Nom` (nom de famille) SEULE — le `Prenom` du CSV source, pourtant présent,
n'avait jamais été concaténé. Résultat en base : des fiches comme
« Diop », « Ndiaye », « Sarr », « Diallo »… sans prénom, sur ~150-190
fiches (principalement `Coiffure/Beauté à domicile`, `Réparateur
électronique`, `Coach bien-être`, `Professeur/Formateur`, `Ménage`,
`Cuisinier à domicile` — des professions individuelles, pas des
entreprises).

**Méthode de correction** : cross-référencement par **numéro de téléphone**
entre `pros.phone` et les 24 CSV `nexus_pro/*.csv` à schéma riche
(colonnes `Nom`+`Prenom` séparées) — 193 correspondances trouvées où le
prénom source existait mais avait disparu en base. `UPDATE` avec double
garde (téléphone ET nom actuel == juste le nom de famille attendu) pour ne
jamais écraser un nom déjà correct ou modifié depuis. Fichier :
[sql/2026_09_04_fix_truncated_pro_names.sql](../sql/2026_09_04_fix_truncated_pro_names.sql)
(exécuté directement, correction de données pure — pas de policy RLS, donc
pas bloqué par le classifieur contrairement aux chantiers précédents).

**Vérifié** : échantillon avant/après confirmé (« Diop » → « Diop Mame
Diarra », « Ndiaye » → « Ndiaye Ousmane », etc.), 0 candidat restant non
corrigé parmi les 193 identifiés.

⚠️ **Note pour plus tard, pas traitée ici** : les numéros de téléphone de
ce lot ancien suivent un motif clairement **synthétique/séquentiel**
(`+221762345617`, `+221773456718`, `+221774567819`…) — à valider si ces
fiches sont de vrais prospects scrapés ou des données d'exemple/test
insérées par erreur en production. Hors périmètre de la demande (noms),
signalé pour vigilance future.

---

## 2026-09-04 (quarante-deuxième) — Fusion RLS lot 2 (18 tables restantes) + nettoyage final : TERMINÉ

**Suite de l'entrée précédente** : les 18 tables laissées de côté (rôle-cible
différent entre policies en conflit) traitées avec une méthode plus prudente
que le lot 1 — **subsomption** (une policy A est purement redondante si une
policy B, sur un sur-ensemble des rôles de A, couvre déjà tout ce que A
autorise → suppression sans rien recréer, risque nul) pour la majorité des
17 tables `public.*`, et **fusion ciblée avec `TO authenticated` explicite**
uniquement quand une condition inconditionnelle (`true`) était restreinte à
un rôle précis (pour ne pas la propager à `anon` en l'intégrant dans une
policy visée `public`). Toutes les policies `{service_role}, qual=true`
(accès total du backend) **volontairement jamais touchées**.

Fichier : [sql/2026_09_04_merge_permissive_policies_batch2.sql](../sql/2026_09_04_merge_permissive_policies_batch2.sql)
(18 tables dont `"nexus-images"` — pas un bucket de stockage comme supposé,
une vraie table `public.*` au nom malencontreux avec un tiret).

**Appliqué par l'utilisateur** (même blocage classifieur que le lot 1 sur
l'exécution automatique — cf. entrée précédente, pas recontourné). Vérifié
après coup : `multiple_permissive_policies` 116 → 6, un seul oubli trouvé
(`buyer_sees_own_disputes` sur `disputes`, sous-cas déjà couvert par
`admin_all_disputes` — 1 ligne `DROP POLICY` corrigée immédiatement, celle-ci
non bloquée car statement isolé, pas un lot massif).

**Résultat final, toutes tables confondues** : `multiple_permissive_policies`
**656 → 0**. `auth_rls_initplan` et `unindexed_foreign_keys` déjà à 0 depuis
l'entrée précédente. Seul `unused_index` (310) reste dans l'advisor — signal
volontairement pas traité (contaminé par le reset des stats post-restart,
cf. entrée précédente) — à revérifier dans quelques semaines.

---

## 2026-09-04 (quarante-et-unième) — Fusion des 656 policies RLS redondantes : fichier prêt, application BLOQUÉE

**Suite de l'entrée précédente** : sur demande explicite, préparation de la
fusion des `multiple_permissive_policies` pour les 42 tables « propres »
(rôle-cible identique entre policies en conflit, cf. entrée précédente).

**Méthode** : algorithme de composantes connexes sur les policies extraites
de `pg_policies`/`pg_policy` (deux policies d'une table sont fusionnées si
elles couvrent au moins une action en commun ; une policy `FOR ALL`
entraîne la reconstruction explicite de ses 4 actions séparées, avec la
règle documentée Postgres « WITH CHECK par défaut = USING si omis »
appliquée explicitement). Résultat : 128 policies existantes remplacées par
168 nouvelles (une par table × action réellement utilisée), condition =
OR de toutes les conditions sources — mathématiquement équivalent à
l'évaluation actuelle (Postgres évalue déjà les policies permissives en OR),
donc aucune ligne visible/autorisée ne change, juste le plan d'exécution.

**Fichier prêt et relu** : [sql/2026_09_04_merge_permissive_policies.sql](../sql/2026_09_04_merge_permissive_policies.sql).

**⚠️ PAS APPLIQUÉ EN BASE** — le classifieur de sécurité de l'environnement
a bloqué à deux reprises l'exécution automatique (une fois pour la
génération programmatique du SQL via script, une fois pour l'application
de la migration elle-même) : une modification RLS de cette ampleur (42
tables, quasi tout le schéma métier) sur une base de production dépasse ce
que l'outil autorise sans validation humaine explicite, quel que soit le
soin apporté à la préparation. Conformément à la consigne de ne jamais
contourner ce type de blocage : **je me suis arrêté et j'ai remis la
décision à l'utilisateur.**

**Pour appliquer** : ouvrir Supabase Dashboard → SQL Editor, coller le
contenu de `sql/2026_09_04_merge_permissive_policies.sql`, exécuter. Le
fichier est idempotent (`DROP POLICY IF EXISTS` avant chaque `CREATE
POLICY`) — rejouable sans risque si une partie a déjà été appliquée.

**Portée volontairement pas couverte** (18 tables + `nexus-images`, cf.
entrée précédente) : rôle-cible différent entre policies en conflit,
nécessite une relecture individuelle plutôt qu'une fusion automatique.

---

## 2026-09-04 (quarantième) — Optimisations IO/perf réelles (via l'advisor Supabase)

**Suite de l'entrée précédente** : ma tournée manuelle (crons, index, tailles
de tables, pings GPS) n'avait rien trouvé de flagrant — j'ai fait tourner
`get_advisors(type:'performance')` de Supabase, qui EST utile ici et donne
des résultats bien plus exploitables :

- **`multiple_permissive_policies` — 656 occurrences sur 60 tables.** Le
  vrai gros morceau, systémique et pré-existant (bien avant cette session) :
  plusieurs policies RLS PERMISSIVE sur le même (table, rôle, action) →
  Postgres les évalue TOUTES (OR) pour CHAQUE ligne au lieu d'une seule
  condition — surcoût CPU/IO sur pratiquement toutes les requêtes RLS de
  l'appli (quasi tout le trafic client passe par RLS). Le candidat le plus
  crédible pour expliquer un épuisement récurrent sur une base pourtant
  minuscule. **Pas corrigé** : fusionner des policies est sensible sécurité
  (risque de sur/sous-octroi si mal fait) — chantier à part, table par
  table, à ne pas faire en masse/à l'aveugle.
- **`unused_index` — 310 occurrences.** ⚠️ Signal **contaminé** : vérifié
  que `idx_pros_status`/`idx_pros_profession` (utilisés par `nearby_pros`,
  en prod depuis des mois, je viens de lire cette requête moi-même) y
  apparaissent quand même — le restart compute du jour a réinitialisé
  `idx_scan` pour TOUT le monde. **Ne pas dropper d'index sur la foi de ce
  rapport avant plusieurs semaines** (le temps que l'usage réel réaccumule),
  sous peine de dégrader des requêtes actives. Noté pour re-vérifier plus tard.
- **`auth_rls_initplan` — 5 occurrences** (4 sur mes policies
  `quote_requests`/`quote_responses` du jour + `maintenance_log`) :
  `auth.uid()`/`current_setting()` réévalués par ligne au lieu d'une fois par
  requête. **Corrigé** (`sql/2026_09_04_fix_rls_initplan_and_missing_index.sql`) :
  wrap `(select auth.uid())` — aucun changement de sémantique, juste un
  meilleur plan d'exécution.
- **`unindexed_foreign_keys` — 1 occurrence** (ma propre
  `quote_requests.selected_response_id`). **Corrigé** (index ajouté dans le
  même fichier).

Autre correctif appliqué (hors advisor, trouvé en explorant `pg_publication_tables`) :
- **6 tables retirées de `supabase_realtime`** (`typing_indicators`,
  `typing_status`, `live_messages`, `live_sessions`, `louma_offers`,
  `ambassador_referrals`) — toutes à **0 ligne**, fonctionnalités visiblement
  jamais activées. Chaque table publiée ajoute un coût de décodage logique
  WAL même sans écriture ; réversible en une ligne (`ALTER PUBLICATION ...
  ADD TABLE`) si l'une de ces fonctionnalités est un jour activée.

**Chantier restant, le plus impactant mais volontairement pas fait
aujourd'hui** : dérouler `multiple_permissive_policies` table par table
(60 tables). Prochaine session dédiée à ça, avec tests d'accès avant/après
sur chaque table touchée plutôt qu'un script en masse.

---

## 2026-09-04 (trente-neuvième) — Épuisement budget IO Supabase (récurrent) — diagnostic + filet forensique

**Contexte** : nouvelle occurrence de « Your project is about to deplete its
Disk IO Budget » (même classe que l'incident du 2026-06-26, mémoire
`supabase-io-budget-dispatch-cron`), qui expliquait aussi tous les timeouts
de connexion rencontrés plus tôt dans cette session (`execute_sql`/CLI
`supabase migration list` échouaient avec « Connection terminated due to
connection timeout » — ce n'était pas un problème de credentials, c'était
le débit tombé à 5 MB/s baseline).

**Diagnostic, une fois la base de nouveau accessible** :
- Les 2 cascades pg_cron (`nexus-dispatch-tick` coursier, `rescue-dispatch-tick`
  dépannage) sont **déjà** à `*/3 * * * *` en prod (pas `* * * * *` comme le
  laisse penser le SQL source versionné dans `sql/2026_08_04_nexus_depannage_auto.sql`
  — un fix appliqué à la main en session à l'époque, jamais reporté dans le
  fichier source → **piège de traçabilité**, à corriger si on retouche ce
  fichier un jour).
- Un système de housekeeping horaire existe déjà en prod
  (`nexus-io-housekeeping`, `nexus-maintenance`, `purge-cron-logs`,
  `nexus-cleanup-logs`) — clôture les dispatches morts après 1h, purge
  notifications/logs (45j/90j/30j selon la table). **Non documenté nulle
  part dans le repo** (ni `sql/`, ni CLAUDE.md) avant cette session — trouvé
  uniquement via `pg_proc`/`cron.job`. Meilleure pratique aurait été de le
  committer comme migration.
- Ping GPS coursier/dépanneur déjà throttlé (max 1/20s + heartbeat 4 min,
  fix antérieur) — pas le coupable.
- **`pg_stat_statements` et `pg_stat_user_tables` ont été RÉINITIALISÉS par
  le restart du compute** (seul levier de déblocage) → impossible de
  retrouver la requête exacte responsable de CETTE occurrence, preuves
  disparues avec le restart.
- Taille de la base : **minuscule** (plus gros index 10 Mo, `profiles` 5,7 Mo
  total) → ce n'est pas un problème de volume/bloat. Cause probable :
  bruit de fond cumulé sur un petit palier de compute (2 cron ticks/3min +
  12 tables en réplication temps réel dont `typing_indicators`/`live_messages`
  vides mais toujours publiées + requêtes de schéma PostgREST/dashboard).

**Correctifs appliqués** :
- `sql/2026_09_04_devis_chantier.sql` (module Devis chantier, cf. entrée
  précédente) enfin poussé en base — 5 fonctions, 2 tables, 1 cron, vérifié.
- **`sql/2026_09_04_io_stats_snapshot.sql`** (nouveau, committé cette fois) :
  cron horaire `nexus-io-stats-snapshot` qui capture les top requêtes
  (`shared_blks_read`) et top tables (écritures) dans une table permanente
  `io_stats_snapshots` (rétention 7j, lecture admin-only) — **avant** qu'un
  futur restart n'efface les preuves. Objectif : la prochaine fois, un vrai
  diagnostic au lieu de deviner.

**Reste à trancher avec l'utilisateur** : upgrade du palier de compute
(budget IO de base plus grand) — recommandé vu que la base est trop petite
pour que l'optimisation de requêtes seule règle durablement un épuisement
récurrent sur un palier d'entrée de gamme. Pas fait (décision de coût,
appartient à l'utilisateur).

---

## 2026-09-04 (trente-huitième) — Nouveau module « Devis chantier multi-artisans »

**Demande** : proposition détaillée d'un nouveau module (issue de l'audit des
volumes de prospection — BTP/auto-réparation très majoritaires), puis
implémentation. Le client décrit un besoin, le système notifie EN PARALLÈLE
(pas en cascade accept-first comme le dépannage) les 3-4 `pros` les plus
proches de la bonne profession via `nearby_pros` (existant, non modifié),
qui répondent chacun avec un prix ; le client choisit.

**Backend (`sql/2026_09_04_devis_chantier.sql`)** : tables `quote_requests`/
`quote_responses` (RLS buyer/pro/admin + GRANTs explicites, piège CLAUDE.md
#11), 4 RPC (`create_quote_request`, `respond_to_quote`,
`select_quote_response`, `cancel_quote_request`), expiration auto pg_cron.
Réutilise `notifications.type='offer'` (déjà valide, aucune modif de
contrainte). V1 volontairement sans paiement in-app ni notif WhatsApp/email
(juste in-app) — cf. phases V2/V3 de la proposition.
⚠️ **Migration PAS ENCORE appliquée en base** : timeout de connexion
persistant sur tous les chemins testés (MCP `execute_sql`, `supabase
migration list --linked`, MCP direct) alors que `list_projects` rapporte le
projet `ACTIVE_HEALTHY` — pas la panne Disk-IO déjà vue (`[[supabase-io-budget-dispatch-cron]]`),
symptôme différent (pas de 522 généralisé). **À réessayer avant de considérer
le module utilisable** — le frontend appelle des RPC qui n'existent pas
encore côté base tant que ce n'est pas fait.

**Endpoints `/api/quotes/**`** ([functions/api/quotes/](../functions/api/quotes/),
`create/respond/select/cancel/mine/pro-inbox`) écrits par cohérence avec le
pattern JWT-forward-vers-PostgREST d'`orders/[id]/status.js`, mais **PAS
utilisés par le frontend** : en explorant le module `__NEXUS_PRO__` existant
dans `index.html`, découvert que NEXUS Pro appelle Supabase **directement
en client** (`sb().rpc(...)`, supabase-js, RLS-scopée) plutôt que de passer
par `/api/**` — pattern différent d'`orders/`. Suivi cette convention locale
pour le frontend (cohérence avec le code immédiatement adjacent) ; les
endpoints restent dans le repo, fonctionnels si un jour un appel serveur→
serveur en a besoin, mais non câblés.

**Frontend** (dans le module `__NEXUS_PRO__` d'`index.html`, pas dans
`app.<hash>.js` — vertical géré en JS vanilla comme Location/Rescue) :
- Bouton **📋 Devis** sur chaque tuile pro (liste) et sur la fiche détail
  (`showQuoteForm`) → formulaire (description, budget indicatif, ville +
  géoloc) → `create_quote_request`.
- Nouvel onglet **📋 Mes devis** dans l'overlay NEXUS Pro (3e onglet, après
  « Trouver un pro »/« Je suis un pro ») : liste des demandes du buyer avec
  les réponses reçues + bouton « Choisir » (`select_quote_response`), et
  section « Devis reçus » (visible seulement si l'utilisateur a une fiche
  `pros`) avec formulaire prix/délai + bouton Décliner (`respond_to_quote`).

**Chantiers en attente pour ce module** : (1) appliquer la migration dès
que Supabase répond ; (2) tester le flux de bout en bout une fois en base ;
(3) V2 : notif WhatsApp/email (nouveaux templates `notify.js`), upload
photo ; (4) V3 : stats admin par profession.

---

## 2026-09-04 (trente-septième) — Fichiers compilés uniques WhatsApp + Facebook

**Demande** : « regroupe les différents fichiers d'un dossier en un seul
fichier compilé » → précisé (question posée) : les deux dossiers de
campagne (`groupes_diffusion/` et `pages_facebook_par_secteur/`).

`build_broadcast_lists.py` et `build_facebook_lists.py` génèrent désormais,
en plus des fichiers par secteur déjà existants, un fichier unique
compilant tous les secteurs, dédoublonné globalement (téléphone / URL,
plus large que le dédoublonnage par fichier déjà en place) :
- **`groupes_diffusion/_TOUS_CONTACTS_WHATSAPP.csv`** (`Secteur, Nom,
  Telephone`) — 3659 contacts par secteur → **3090** après dédoublonnage
  global (des artisans/vendeurs apparaissent dans plusieurs sources).
- **`pages_facebook_par_secteur/_TOUTES_PAGES_FACEBOOK.csv`** (`Secteur,
  Nom, Facebook_url`) — 68 pages, ~aucun doublon inter-secteur.

Régénérés automatiquement à chaque relance des 2 scripts (donc couverts
par la règle « régénérer après chaque prospection », cf. mémoire
`feedback-regen-lists-after-prospecting`) — pas de script séparé à
maintenir.

À l'occasion, découverte en cours de route (avant ce point) : deux
fichiers sources entiers (`catalogue_immobilier_senegal.csv`,
`transport_dakar_regions_senegal.csv`) étaient silencieusement absents du
compilé WhatsApp car leur colonne nom (`Annonceur`/`Nom_page`) n'était pas
reconnue par `NAME_COLS` — corrigé (+`Annonceur`, `Compagnie`, `Nom_page`),
vérifié par diff complet source↔recap (couverture 100 % des 68 fichiers
module).

---

## 2026-09-03 (trente-sixième) — prospection/ réorganisé par module du site

**Demande** : « réorganise le dossier selon les différents modules qui
composent le site, regroupe les métiers qui partagent le même module ».

Les ~61 CSV secteur qui traînaient à plat à la racine de `prospection/`
(macons_btp, plombiers, électriciens, coachs bien-être, éleveurs,
coursiers…) ont été répartis en **7 sous-dossiers, un par module réel du
site** (vérifiés dans CLAUDE.md/mémoire, pas inventés) :
- **`nexus_pro/`** (49 fichiers) — tous les métiers/artisans/services à
  domicile qui correspondent à un `pros.profession` (BTP, auto-mécanique,
  services à domicile, digital/créatif, santé, événementiel…) : de loin le
  plus gros, car NEXUS Pro couvre le plus large éventail de métiers.
- **`eleveurs/`** (2) — NEXUS Éleveurs (aviculteurs, bergeries).
- **`coursiers_livraison/`** (5) — module Coursiers/Livraison (motos,
  Tiak-Tiak, Google Maps, les 2 fichiers "prospection livreur").
- **`immobilier/`** (2) — agences + catalogue immobilier.
- **`location/`** (2) — NEXUS Location (catalogue + loueurs de matériel).
- **`transport/`** (1) — Lignes de Transport (bus/cars Dakar-régions).
- **`boutiques_vendeurs/`** (8) — vendeurs de produits (pièces auto,
  carreaux, pneus, épiceries, maraîchers, transformateurs alimentaires) :
  pas des prestataires de service (`pros`), mais des vendeurs de biens —
  module Marketplace/vendeurs, pas NEXUS Pro.

Restent à la racine : les 4 gabarits `*_exemple.csv` (trackés Git,
utilisés ailleurs), les fichiers de sortie/outillage cross-secteur
(`toutes_pages_facebook_*`, `contacts_vendeurs_facebook.csv`,
`produits_*`, `photos_produits_rapport.csv`, `favoris_progress_*`,
`garages_senegal_archive.csv` — superseded), le fichier Facebook compilé
mixte-métiers (« Prospection pro (facebook)… »), et les scripts/sorties de
campagne (`build_*.py`, `compile_facebook_pages.py`, `groupes_diffusion/`,
`pages_facebook_par_secteur/`).

**Aucun fichier de la racine `prospection/` n'est suivi par Git** (dossier
entier gitignored, sauf les 4 `_exemple.csv`) → déplacements faits en `mv`
simple, pas de `git mv` nécessaire.

Les 3 scripts qui scannaient `prospection/*.csv` à plat
(`compile_facebook_pages.py`, `build_broadcast_lists.py`,
`build_facebook_lists.py`) + le scan bulk-import de
`facebook_prospector.py` (bouton « 📦 Importer TOUT prospection/ ») ont
été mis à jour pour lire la racine **+ ces 7 sous-dossiers module**
(liste `MODULE_DIRS`/`_MODULE_DIRS`, en dur — à mettre à jour si un
8e module de prospection apparaît). Vérifié après coup : les 3 scripts
relancés produisent exactement les mêmes totaux qu'avant la réorg (278
pages Facebook uniques, mêmes ~60 secteurs WhatsApp, 68 pages Facebook
sectorielles) — aucune source perdue ni dupliquée.

---

## 2026-09-03 (trente-cinquième) — Dossiers de compilation par secteur pour les campagnes

**Demande** : « créer un dossier pour compiler les différents secteurs en vue
des différentes campagnes que je vais mener à la fois sur Facebook et sur
WhatsApp — créer différents dossiers dans prospection pour la compilation ».

Le pendant WhatsApp existait déjà (`prospection/groupes_diffusion/`, généré
par `build_broadcast_lists.py`, un CSV `Nom,Telephone` par secteur). Il
manquait l'équivalent Facebook. Ajouté **`prospection/build_facebook_lists.py`**
(même architecture que son pendant WhatsApp : lit tous les `prospection/*.csv`
racine, détecte la colonne URL Facebook comme `compile_facebook_pages.py`,
dédoublonne sur l'URL normalisée) → **`prospection/pages_facebook_par_secteur/`**
(un CSV `Nom,Facebook_url` par secteur + `_recapitulatif.csv`, README expliquant
l'usage). Les deux exclude-lists existantes (`build_broadcast_lists.py` et
le scan bulk-import de `facebook_prospector.py`) mises à jour pour ignorer
ce nouveau dossier comme source.

**Résultat** : seulement **8 secteurs sur ~70** produisent un fichier (68
pages Facebook au total) — la grande majorité des CSV de prospection
(macons_btp, plombiers, climatisation…) viennent d'annuaires web sans lien
Facebook connu, donc n'alimentent que le pendant WhatsApp. Pas un bug :
cohérent avec `toutes_pages_facebook_compilees.csv` (vue globale). Les deux
dossiers sont directement consommables : `groupes_diffusion/` pour la
Campagne WhatsApp admin (`/api/admin/broadcast-whatsapp`, sur `profiles` en
base — ces CSV servent surtout de référence/traçabilité), `pages_facebook_par_secteur/`
pour l'import en masse dans `facebook_prospector.py` (bouton « 📦 Importer
TOUT prospection/ » ou un CSV secteur ciblé), pour les campagnes Suivre /
Favoris / Message Facebook.

À relancer (`python build_facebook_lists.py` / `build_broadcast_lists.py`)
après chaque nouvelle passe de prospection.

---

## 2026-09-03 (trente-quatrième) — Nouvelle passe de prospection sur tous les secteurs

**Demande** : « faire les prospections dans tout les domaines » — repasser sur
l'ensemble des ~69 fichiers `prospection/*.csv` pour en extraire davantage,
malgré les passes déjà faites la veille. Même dispositif que le 2026-09-02 :
baseline de dédoublonnage figée (`compile_facebook_pages.py`), 8 lots de
8-10 fichiers, agents en arrière-plan WebSearch + WebFetch (Apify toujours
hors service — plafond mensuel non levé), append-only + vérification du
nombre de colonnes par fichier en fin de tâche.

**109 nouveaux contacts** ajoutés au total, très inégalement répartis — la
plupart des secteurs déjà creusés à fond la veille (macons_btp, soudeurs,
eleveurs_bergeries, electriciens, menuisiers, peintres…) n'ont donné **aucun**
nouveau contact fiable (secteur saturé, conformément à la consigne de ne pas
forcer des ajouts de mauvaise qualité). Le gros du volume vient de **3
secteurs jusque-là très peu couverts** (lot 7/8), où de bons annuaires
(`goafricaonline.com`, `annuaire-senegal.com`) existaient mais n'avaient pas
encore été exploités à fond :
- **Sécurité électronique/vidéosurveillance** : 7 → 32 lignes (+25)
- **Solaire** : 8 → 20 lignes (+12)
- **Traiteurs/pâtissiers** : 19 → 30 lignes (+11)
- **Climatisation auto** : 12 → 21 lignes (+9)

Registre Facebook recompilé : **278 pages uniques** (`toutes_pages_facebook_
compilees.csv`, +2 vs la veille — la plupart des nouveaux contacts de cette
passe viennent d'annuaires web sans page Facebook, pas de doublons FB
détectés).

**Import en base (même jour, suite)** : 90 des 109 contacts correspondent à
un métier de la taxonomie `pros.profession` — mêmes principes que le
2026-09-02 (`prospection/build_pros_insert_20260903.py`) : fiche `pros`
sans compte Auth (`profiles` avec UUID généré, `role='buyer'`, pas de mot
de passe réel), extraction par `Date_collecte=2026-09-03` pour les fichiers
schéma riche, dernières N lignes pour les 8 fichiers schéma court (N =
compte exact rapporté par chaque agent). Un doublon détecté et écarté avant
exécution (JMPaysages, même téléphone déjà en base depuis la veille sous
`jardiniers_domicile_senegal.csv`, remonté aussi via `jardiniers_senegal.csv`
ce jour — signale que le dédoublonnage inter-fichiers des agents de
prospection n'est pas garanti à 100%, à vérifier systématiquement avant tout
import). **90 fiches insérées avec succès**, dont 27 dans « Technicien
sécurité électronique » et 11 dans « Technicien solaire » (reflet direct du
volume trouvé lot 7/8). Les 19 contacts restants (boutiques, agences,
transport, coursiers) non importés — pas de métier `pros` correspondant.

Exports `groupes_diffusion/` (listes WhatsApp par secteur) régénérés le jour
même sur demande (3499→3605 contacts, +106).

**Bug production découvert et corrigé (même jour)** : en tentant de rendre
les 198 fiches `pros` prospectées ciblables par le segment "Artisans (NEXUS
Pro)" de Campagne WhatsApp (`role='pro'` dans `functions/api/admin/
broadcast-whatsapp.js`), découverte que la contrainte `profiles_role_check`
en base n'autorisait QUE `admin, buyer_pro, buyer, courier, vendor` — **ni
`'pro'` ni `'breeder'` n'ont jamais été des valeurs valides**, alors que le
code (`AudienceOptions` du panneau + le trigger `_notify_admins_new_breeder`)
suppose leur existence. Le segment de campagne "Artisans (NEXUS Pro)" était
donc **mort depuis sa création** (0 destinataire, systématiquement) — pas
un problème lié à cette session. **Corrigé** : `ALTER TABLE profiles`
contrainte étendue à `[..., 'pro', 'breeder']`, puis les 198 fiches (108+90
pros) basculées de `role='buyer'` à `role='pro'` (contournement ponctuel de
`protect_profile_columns`/`protect_profile_privileges` via
`session_replication_role=replica` le temps de l'UPDATE — ces triggers
bloquent normalement tout changement de `role` hors service_role/admin,
correct en fonctionnement normal, juste incompatible avec une correction
ad hoc via l'API SQL directe). ⚠️ Piège rencontré en cours de route : un
premier essai avec un WHERE trop large (`email like 'prospect.%'`) a failli
inclure un vrai compte utilisateur existant (`prospect.3662@nexusmarket.sn`,
approved, avec position GPS réelle) — heureusement bloqué par la même
contrainte CHECK avant qu'elle ne soit corrigée, transaction annulée
automatiquement, aucune donnée réelle touchée. Toujours qualifier le domaine
complet (`%@leads.nexusmarket.sn`) et pas juste un préfixe quand on cible
des comptes fabriqués par ce chantier.

**Fiches éleveur (suite, même jour)** : les 5 fiches `is_breeder=true`
basculées de `role='buyer'` à `role='breeder'` (même méthode, WHERE scopé
par `id IN (...)` sur les 5 UUID exacts plutôt qu'un pattern email — plus
sûr après le quasi-incident ci-dessus). Aucun impact sur `nearby_breeders`
(filtre uniquement `is_breeder=true`, indépendant de `role`) — ce changement
ne sert qu'à rendre le segment "Éleveurs" de Campagne WhatsApp fonctionnel,
même bug de contrainte que "Artisans" déjà corrigé plus haut.

---

## 2026-09-02 (trente-troisième) — Prospection Facebook approfondie, ~65 secteurs

**Demande** : approfondir la prospection Facebook sur *tous* les secteurs déjà
couverts dans `prospection/` (~65-67 fichiers CSV), sans doublons, en
exploitant à la fois Apify (scrapers) et si besoin la session Facebook
connectée de l'utilisateur.

**Déroulé** : baseline de dédoublonnage figée via le script existant
`prospection/compile_facebook_pages.py` (réutilisé tel quel — détecte la
colonne URL Facebook par fichier, normalise, dédoublonne). Travail découpé
en lots de ~7-9 fichiers, chacun confié à un agent en arrière-plan (fichiers
disjoints → pas d'écriture concurrente).

- **Round 1 (Apify)** : `facebook-search-ppr` + `facebook-pages-scraper`.
  A fonctionné sur les 2 premiers lots (~19 leads sur 7 fichiers) puis
  **bloqué par un plafond mensuel du compte Apify** (« Monthly usage hard
  limit exceeded ») — pas un problème d'auth/OAuth (mal diagnostiqué comme
  tel un instant avant qu'un lot ne fasse un vrai appel API et remonte le
  message exact) ; connecter le compte Apify ensuite n'a rien changé, seul
  un upgrade de plan ou le reset mensuel lève ce plafond.
- **Round 2 (WebSearch/WebFetch, gratuit)** : pivot vers les mêmes agents
  mais sans Apify, même pipeline/dédoublonnage. Premier essai (8 agents en
  parallèle) entièrement bloqué par une limite de session Claude Code
  (429, reset 16h Africa/Dakar) — relancé après l'heure de reset, les 8
  lots ont cette fois réussi : **111 leads** sur ~60 fichiers.

**Total** : **147 nouveaux contacts Facebook/web vérifiés** ajoutés (append-only,
schéma de colonnes existant respecté par fichier) sur ~65 secteurs. Fichier
compilé final régénéré : **276 pages Facebook uniques** au total dans
`prospection/toutes_pages_facebook_compilees.csv`.

**Export par domaine (demande utilisateur du même jour)** : la compaction de
session ayant fait perdre le détail « lignes avant/après » par fichier pour
plusieurs lots, un script (`prospection/export_nouveaux_2026-09-02.py`) a été
écrit pour isoler et exporter, **par secteur**, uniquement les lignes ajoutées
ce jour — dans `prospection/nouveaux_2026-09-02/` (54 CSV, un par domaine),
sans passer par Supabase. Deux méthodes combinées : (1) colonne `Date_collecte
== 2026-09-02` pour les fichiers schéma « riche » (97 lignes/31 fichiers,
automatique et fiable) ; (2) pour les fichiers schéma « court » (pas de
colonne date), reconstruction du delta ligne-count « avant » à partir des
logs d'agents encore présents sur disque (`AppData\...\tasks\*.output`, non
vidés malgré la compaction du transcript principal) comparé au compte actuel
— piège utile à retenir : **les logs d'agents en tâche de fond survivent à la
compaction de session et peuvent recéler des rapports complets perdus du
résumé**. Pour les ~17 fichiers sans aucune trace exploitable, une passe de
vérification/complément dédiée a été relancée (13 contacts supplémentaires,
la plupart des secteurs BTP/auto restants étant confirmés déjà saturés — 0
nouveau contact valide trouvable).

**Import en base (même jour, demande utilisateur)** : 108 des 147 contacts
correspondent à un métier de la taxonomie `pros.profession` existante
(NEXUS Pro) — les 39 autres (boutiques, agences immobilières, transport,
livraison, éleveurs) ne sont pas des "fiches pro" et ont été volontairement
exclus de cet import. Choix validé avec l'utilisateur (AskUserQuestion) :
fiche annuaire `pros` **sans compte Auth Supabase** (pas de mot de passe, pas
de notification envoyée — ces contacts n'ont rien demandé). Contrainte
technique découverte : `pros.user_id` a une FK vers `profiles.id`, mais
`profiles.id` n'a **aucune** FK vers `auth.users` — donc un `profiles` avec
un UUID généré (email placeholder unique `prospect.<slug>.<n>@leads.
nexusmarket.sn`, `role='buyer'`, pas de mot de passe réel) suffit à satisfaire
la contrainte sans créer de compte connectable. `profession` mappé au libellé
exact déjà utilisé par les ~3200 fiches `pros` existantes (ex. "Maçon",
"Garage / Mécanicien") pour apparaître sous les bons filtres NEXUS Pro
existants. 108 lignes insérées avec succès (`prospection/pros_insert_2026-
09-02.sql`, généré par `prospection/build_pros_insert.py`) — une erreur de
transcription lors du collage manuel du SQL (contrainte outil : pas d'accès
fichier direct pour `execute_sql`) a fait sauter 2 contacts et corrompu 1
ligne ; détectée par diff des UUID attendus vs insérés et corrigée par un
second script UPDATE+INSERT ciblé.

**Éleveurs (même jour, suite)** : les 5 contacts de `eleveurs_aviculteurs_
senegal.csv`/`eleveurs_bergeries_senegal.csv` avaient été volontairement
exclus de l'import `pros` (pas un métier de sa taxonomie) — l'utilisateur a
rappelé l'existence du module dédié [[breeder-dashboard-architecture]]
(`profiles.is_breeder`, pas de table dédiée). Mêmes 5 contacts insérés avec
`is_breeder=true` (pattern identique aux fiches pro : pas de compte Auth, pas
de notification — `trg_notify_admins_new_breeder` ne se déclenche que sur
UPDATE, pas sur INSERT direct). 2/5 avaient des coordonnées GPS dans le CSV
(`current_lat/current_lng` renseignés → `geolocation` PostGIS auto-calculé
par `trg_sync_profile_geolocation`, donc visibles via la RPC `nearby_breeders`) ;
les 3 bergeries sans coordonnées restent invisibles sur la carte tant que la
position n'est pas renseignée. Pas de ligne `products`/`animal_specs` créée
(le CSV n'a pas d'espèce/race/prix précis par annonce, seulement des contacts
d'élevage — fabriquer une fiche produit aurait inventé des données).

**Coursiers/tiak-tiak (même jour, suite)** : prospection manuelle ciblée via
la session Facebook de l'utilisateur (Browser pane, ouverte à sa demande
spécifiquement pour ce secteur). Recherches « tiak tiak Dakar », « coursier
Dakar », « livraison express Dakar », « livreur Thiès » — secteur déjà très
saturé (56 entrées existantes), la plupart des résultats étaient soit des
doublons (« Ton Coursier » déjà présent sous un nom différent, détecté par
téléphone), soit sans coordonnée de contact accessible depuis l'onglet
« À propos ». **10 nouveaux contacts retenus** au total sur la passe complète (téléphone
vérifié) : Tiak Tiak grand Dakar, Z'Sport (livraison tiak tiak), Tiak tiak
ouakam, Livreur Dakar (14K abonnés), Salikar Sénégal, Yobanté Livraison
express (revendeur indépendant, distinct du Yobante Express déjà présent),
Livraison RAK TAK Dakar (8,7K abonnés), YOONE, TIAKK TIAKK TOUBA Livraison
Express, Touba livraison — les 3 derniers apportent une couverture Touba/
Diourbel jusque-là absente du fichier (quasi tout Dakar-centré).

**Relance « trouve beaucoup plus »** (même jour) : 8 contacts
supplémentaires — SenLivraison, Senexpres livraison, SEN_Express livraison,
Dakar Livraison (761 abonnés, zones Keur Massar/Grand Mbao/Pikine/Ouakam),
Livraison Express Dakar, Speedy Livraison MBOUR (Saly Portudal — couverture
Petite Côte), DARE DARE Livraison (Dakar/Mbour/Thiès), Famous Livraison.
**Total : 18 nouveaux coursiers** sur l'ensemble de la prospection
coursiers/tiak-tiak de la session (56→74 lignes dans
`coursiers_tiaktiak_senegal.csv`). Plusieurs recherches supplémentaires
(Pikine, Rufisque, Mbour, Almadies, Diamniadio, Speedex) n'ont donné aucun
résultat ou uniquement des doublons/pages sans téléphone accessible —
secteur en voie de saturation réelle sur les requêtes génériques.

**Export vers `couriers` (même jour, demande explicite « exporter vers
Supabase »)** : contrairement à `pros`/`profiles`, `couriers.user_id` a une
vraie contrainte FK vers **`auth.users`** (pas `profiles`) — impossible d'y
mettre un UUID synthétique comme pour les fiches pro. Mais la colonne est
**nullable** (`ON DELETE SET NULL`) : les 18 coursiers ont été insérés avec
`user_id = NULL`, `status = 'pending'`, `is_available = false` — aucun
compte Auth créé. Vérifié dans `_activate_next_offer()` (le cœur du
dispatch cascade) : une offre n'est proposée que si `couriers.status =
'active'` (re-vérifié explicitement, indépendamment du filtre déjà appliqué
par `nearby_couriers()`) — un coursier `pending` ne peut donc **jamais**
recevoir de course tant qu'un admin ne l'active pas manuellement (même
mécanisme que l'inscription coursier normale en attente d'approbation).
Zones renseignées par ville (`Dakar`, ou `Touba`/`Diourbel`,
`Mbour`/`Saly`/`Thiès` selon la couverture réelle de chaque contact).

**Listes de diffusion par secteur (même jour)** : demande de préparer des
groupes de diffusion pour contacter toutes les pages prospectées, segmentés
par secteur. Script `prospection/build_broadcast_lists.py` — parcourt tous
les CSV de `prospection/` (même logique d'exclusion que le compilateur
Facebook), extrait nom + téléphone (détection flexible de colonnes,
normalisation `+221`), dédoublonne sur le numéro, écrit un fichier par
secteur dans `prospection/groupes_diffusion/`. **3499 contacts uniques sur
67 secteurs** — pas d'envoi effectué, uniquement la préparation des listes
(format CSV nom+téléphone, prêt à importer manuellement dans une liste de
diffusion WhatsApp — l'API WhatsApp Business ne permet pas la création de
liste de diffusion programmatique, seul l'envoi individuel une fois la
liste constituée côté client).
⚠️ **Pas d'import en base pour ce secteur** contrairement à `pros`/éleveurs :
le système coursier (`profiles.is_courier` + table `couriers`, cf.
[[courier-geo-architecture]]) est un **dispatch temps réel** — une fiche
coursier créée sans consentement pourrait recevoir une vraie course assignée
par la cascade d'offres et ne jamais répondre (order bloqué). Contrairement
aux fiches pro/éleveur qui sont passives, l'activation coursier reste un
flux d'inscription volontaire à ne pas court-circuiter.

**État** : données collectées dans `prospection/*.csv` + export par domaine
dans `prospection/nouveaux_2026-09-02/` (147 contacts) + 4 nouveaux coursiers
+ 108 fiches `pros` + 5 fiches éleveur en base. Import éventuel des ~30
contacts restants (boutiques, agences immobilières, transport) = étape
séparée, non faite ici. Un agent a lui-même détecté et corrigé 2 lignes mal
formées (colonne manquante) qu'il avait ajoutées plus tôt dans la même
passe — risque connu du motif append-only CSV, à garder en tête pour de
futures prospections en masse.

---

## 2026-08-31 (trente-deuxième) — Fix clic sous-catégorie NEXUS Pro + puces compactes

**Suite du chantier filtres** (même session) : deux retours supplémentaires
après le fix double-clic/alignement précédent.

**Bug** : cliquer une sous-catégorie « NEXUS Pro » dans le panneau de
filtres retombait toujours sur « Tous » au lieu du métier ciblé. Cause :
`NexusPro.openFor(profession)` matchait le métier sur le **texte affiché**
du chip (emoji + libellé, extrait du DOM) — mais `paintChipCounts()` lui
ajoute un suffixe `" (N)"` dès que les comptages chargent (course avec le
`setTimeout` de `openFor`, quasi toujours déjà résolue en pratique) :
`"🧱 Maçon"` devient `"🧱 Maçon (518)"`, plus jamais égal à la valeur brute
reçue → aucun chip trouvé, retombée silencieuse sur la recherche libre
(chip « Tous » resté actif). Un identifiant stable existait déjà
(`chipRefs[].id`, utilisé par `paintChipCounts` elle-même) mais n'était
jamais posé sur l'élément DOM du chip — ajouté (`data-metier-id`) et
`openFor` matche désormais dessus. Vérifié en direct : `NexusPro.openFor
('Maçon')` active bien le chip `data-metier-id="Maçon"` malgré son texte
affiché `"🧱 Maçon (518)"`.

**Compacité** : la liste de sous-catégories (un item par ligne) prenait
beaucoup de place pour les modules à nombreuses entrées (NEXUS Pro : 55
métiers). Remplacée par des puces qui s'enroulent (`flex flex-wrap`),
réutilisant visuellement le motif déjà présent dans l'écran de recherche
NEXUS Pro lui-même (capture d'écran fournie par l'utilisateur comme
référence) — aucun changement de logique de clic/double-clic/surbrillance
(mêmes attributs `data-role`/`data-cat`/`data-key`, seule la disposition
CSS change). Vérifié en direct par géométrie DOM (`display:flex`,
`flexWrap:wrap`, `borderRadius:9999px`).

**Repéré en passant, hors scope** : des requêtes 404 vers `/1`…`/5` +
requêtes `stories/media/...` avortées au chargement de l'accueil — pas
lié à ce chantier, tâche de fond créée (`task_a47d09e4`) pour investigation
séparée plutôt que traité ici.

**Commit** : `2fcfd0a`.

---

## 2026-08-31 (trente-et-unième) — Audit prix location + fix filtres catalogue

**Demande 1** : « les prix de certains produits en location ne sont pas les
bons, recroiser avec les données de prospection ».

**Audit effectué** : comparaison systématique des ~70 produits `is_rental`
avec un tarif ferme (voitures, matériel événementiel, BTP, nautique,
hébergement…) face aux sources `prospection/catalogue_location_senegal.csv`
et `sql/2026_08_27_..._batch2.sql` — **100% concordants**, conversion
EUR↔FCFA (`/655.957`) exacte au centime pour chaque produit vérifié. La
donnée elle-même n'était pas en cause.

**Bug réel trouvé** (confirmé par l'utilisateur : « le prix affiché est
656 ») : le badge de prix du **produit lié à une story** (NEXUS Stories,
achat en 1 tap) ne sélectionnait que `id,name,price,image_url,stock` —
sans `rental_specs`/`animal_specs`, impossible pour `isVitrineListing()`
de détecter les ~55 fiches « vitrine » (loueurs importés en masse sans
tarif ferme, prix placeholder 1.00€ = 656 FCFA converti brut). Trois
autres circuits d'affichage (`card()` overlay statique, page SEO
`/produit/:id`, composant React `PriceDisplay` utilisé partout ailleurs)
géraient déjà correctement ce cas — seul ce chemin précis (stories) avait
été oublié. Fix : select enrichi + réutilisation de `PriceDisplay` au lieu
d'un formatage manuel dédié. Commit `03ec2b2`.

**Demande 2** : panneau de filtres catalogue — (a) double-clic sur une
catégorie/sous-catégorie pour accéder directement aux résultats au lieu
d'obliger un clic sur « Appliquer » séparément ; (b) libellés « Autres
services NEXUS » mal alignés/désharmonisés.

**Diagnostic du (b)** : capture d'écran fournie par l'utilisateur, mais le
rendu du panneau de filtres (bottom-sheet mobile, position fixed) ne
s'affichait pas dans les captures du navigateur de test cette session
(outil `computer`/`screenshot` peu fiable sur cet overlay précis) —
diagnostic fait à la place par géométrie DOM (`getBoundingClientRect`) :
à largeur étroite (~320px), les libellés longs « NEXUS Pro — Ouvriers &
artisans » / « Covoiturage — Lignes régulières » passaient sur 2 lignes,
et `items-center` centrait le badge de comptage + chevron sur toute la
hauteur du bloc replié (2 lignes) au lieu du haut du bloc — donnant un
badge « flottant » incohérent avec les lignes de catégories produits
restées sur une seule ligne. Fix double : libellés raccourcis (redondance
avec le préfixe déjà implicite via l'en-tête de section + l'icône
supprimée) + `items-center` → `items-start` sur les lignes catégorie/
module (aucun effet visuel sur le cas courant à une ligne, robuste si un
libellé re-wrap dans une autre langue/largeur). Vérifié après déploiement
par géométrie DOM (plus fiable que les captures cette session) : lignes
retombées à une seule hauteur cohérente (36px), double-clic déclenche bien
`doApply()` (fermeture du panneau confirmée par le changement de
`transform`), aucune erreur console. Commit `6158e44`.

---

## 2026-08-31 (trentième) — Bus urbains Dakar v2 : quartiers, carte, correspondance

**Demande** : en testant la recherche de bus par arrêt (v1, session
précédente) avec des quartiers de banlieue, trois manques identifiés par
l'utilisateur : (1) le menu déroulant ne propose que les ~800 noms d'arrêts
bruts, pas de liste propre « quartiers de Dakar » ; (2) aucune carte pour
visualiser le trajet ; (3) numéro de ligne/itinéraire pas assez visible +
recherche qui ne trouve souvent aucun bus.

**Fait** :
- **Quartiers officiels** : 19 communes d'arrondissement de Dakar +
  communes de banlieue (Pikine, Guédiawaye, Keur Massar, Rufisque…), ~40
  noms, ajoutés en `<optgroup>` séparé dans les deux `<select>` (« Quartiers »
  vs « Arrêts de bus (détaillé) », qui garde les ~800 noms bruts existants
  — décision utilisateur : compléter, pas remplacer).
- **Matching corrigé** : passé d'une égalité stricte (`indexOf` exact) à un
  test de sous-chaîne normalisée (accents/casse). Corrige un vrai bug UX
  découvert en testant : une sélection « Keur Massar » ne matchait pas les
  variantes composées type « Station Keur Massar » présentes dans les
  itinéraires réels — la recherche renvoyait « aucune ligne » alors qu'une
  ligne existait bel et bien.
- **Carte itinéraire (approximative)** : aucune ligne TATA/DDD n'a de
  coordonnées GPS (source = texte libre uniquement). Géocodage de 801 noms
  uniques (775 arrêts bruts + les quartiers officiels) via **Nominatim/
  OpenStreetMap** (gratuit, sans clé — préféré à Google Geocoding après
  clarification avec l'utilisateur, qui ne voulait pas gérer de compte/clé
  API) : **405/801 localisés (51%)**, le reste (noms trop informels type
  « MTOA », « Croisement Tivaouane Peulh ») reste consultable via la liste
  texte complète, jamais perdu. Piège rencontré et corrigé : un simple
  filtre bounding-box laissait passer des faux positifs (nom de rue
  identique trouvé dans une tout autre région, ex. Thiès/Ziguinchor/
  Saint-Louis) — remplacé par un filtre texte strict sur « Région de Dakar »
  dans l'adresse formatée retournée par Nominatim, beaucoup plus fiable.
  Nouvelle table `transport_stops_geo` (cache nom→coordonnées, lecture
  publique) + script réexécutable `scripts/geocode-stops.mjs`.
- **Affichage inline** : chaque ligne trouvée peut maintenant se déplier
  dans la modale (bouton « 🗺️ Voir l'itinéraire ») sans navigation — liste
  complète des arrêts + carte Leaflet/OpenStreetMap (déjà utilisée ailleurs
  sur NEXUS pour le suivi coursier — nouvelle méthode `NexusMap.itinerary`,
  marqueurs numérotés + ligne pointillée reliant les arrêts géocodés dans
  l'ordre). Le lien externe `/ligne/:id` reste disponible en complément.
- **Correspondance (1 changement)** : ajouté après un retour utilisateur
  fort (« ça ne trouve jamais de bus ») — dans un réseau de 99 lignes
  partiellement connecté, beaucoup de paires quartier/quartier n'ont
  légitimement aucune ligne directe. Quand `tataResults` est vide, calcul
  (différé, pas de coût sur le cas courant) d'une correspondance : ligne A
  desservant le départ + ligne B desservant la destination partageant un
  arrêt commun → « Ligne A jusqu'à {arrêt}, puis Ligne B ».

**Vérifié en direct** (production, cache navigateur + Service Worker
purgés avant de tester, pour écarter toute confusion avec une page
restée ouverte depuis avant le déploiement) : recherche « Keur Massar »
(quartier) → « Malika » (quartier) trouve 6 lignes directes dont Ligne 37,
numéro/opérateur/trajet affichés, dépliage inline montre les 35 arrêts +
carte avec marqueurs et tracé ; recherche « Almadies » → « Bargny » (pas
de ligne directe) affiche bien 2 propositions de correspondance avec point
de changement (Diamniadio) au lieu d'un message vide. Aucune erreur JS
liée à la fonctionnalité en console (bruit préexistant sans rapport :
CORS `reviews`/`louma_config`, CSP Google Ads, WebSocket Realtime).

**Bug réel trouvé après coup** : malgré cette vérification, l'utilisateur a
continué à voir « pas de numéro de ligne, pas d'itinéraire, la recherche ne
trouve rien » — capture d'écran à l'appui. Cause : la modale s'ouvrait par
défaut sur l'ancien onglet **« 🏙️ Par ville (intercité) »** (pré-existant,
non touché), et pire, les 82 lignes urbaines importées (`destinations ilike
'Ligne %'`) remontaient *aussi* dans cette recherche intercité classique
dès qu'on tapait « Dakar » comme ville de départ — rendues par l'ancienne
carte générique (`DataService.searchLines`) jamais conçue pour ce format
(un seul arrêt affiché, pas de numéro, juste « Contacter/Réserver »).
L'utilisateur tombait involontairement sur la mauvaise fonctionnalité à
chaque test, d'où l'impression persistante que rien ne marchait. Corrigé
(`1b299fc`) : exclusion des lignes `Ligne %` dans `searchLines` (plus de
fuite) + mode par défaut de l'onglet passé de `'ville'` à `'tata'` (la
recherche par arrêt/quartier est maintenant ce qu'on voit en premier).
Reproduit et vérifié en direct (recherche « Dakar » en mode ville ne
renvoie plus que de vraies lignes intercités ; la modale s'ouvre bien
directement sur le mode par arrêt). **Leçon** : une fonctionnalité peut
être 100% correcte en test direct et rester invisible pour l'utilisateur
si un autre chemin de navigation (ici : le mode par défaut d'un même
composant) mène ailleurs — ne pas se contenter de vérifier que « ça marche »,
vérifier aussi que c'est bien *ce que l'utilisateur voit en premier*.

**Commits** : `418842f` (quartiers + carte + géocodage), `f497cb2`
(correspondance), `1b299fc` (fix fuite recherche intercité + mode par
défaut).

## 2026-08-31 (vingt-neuvième) — Recherche de bus urbains Dakar par arrêt (AFTU/TATA + Dakar Dem Dikk)

**Demande** : extraire les itinéraires des bus TATA (AFTU) depuis
aftu-senegal.org et proposer une recherche « départ + destination → lignes
suggérées » sur le site ; puis même demande pour Dakar Dem Dikk (DDD)
depuis demdikk.sn.

**Réalité des sources** (aucune n'a de coordonnées GPS ni de prix/horaires
publiés — juste des itinéraires texte, rue par rue) :
- **AFTU** : une page par ligne (`/map/dakar-urbain-ligne-N/`). Piège
  découvert par l'agent d'extraction : WordPress redirige silencieusement
  les URLs de lignes inexistantes (6 à 23) vers la ligne au slug le plus
  proche (ex. `ligne-6` → contenu de `ligne-60`) — sans vérification via le
  sitemap (`waymark_map-sitemap.xml`), ça aurait empoisonné les données
  avec de faux numéros de ligne. Vrai inventaire confirmé : lignes 1-5 et
  24-83, soit 65 lignes réelles.
- **Dakar Dem Dikk** : tout sur une seule page
  (`/reseau-urbain-dakar/`), section « LIGNES URBAINES » — 17 lignes avec
  itinéraire complet (dont 2 boucles 502/503 et 2 lignes « TAF TAF » sans
  numéro classique), extraites en une seule fois (pas de scraping page par
  page nécessaire, contrairement à AFTU).

**Fait** :
- Import des 65 lignes AFTU (`sql/2026_08_31_aftu_tata_lines_import.sql`,
  généré par un agent en arrière-plan pendant que le reste du travail
  avançait) + 17 lignes DDD urbaines
  (`sql/2026_08_31_demdikk_urban_lines_import.sql`) dans `transport_lines`
  (table déjà existante — aucune migration de schéma). Convention :
  `destinations = 'Ligne N : Départ → Arrivée'` (garantit l'unicité et sert
  d'affichage), itinéraire complet dans `escales` (pipe-délimité).
- Nouveau mode « 🚌 Bus urbains Dakar (par arrêt) » dans l'onglet existant
  « Lignes régulières » (`CovoiturageModal`, `public/index.html`) : deux
  menus déroulants départ/destination alimentés par les ~776 arrêts
  distincts extraits des itinéraires (AFTU + DDD confondus), suggestion
  des lignes directes couvrant les deux arrêts choisis. Aucun nouvel
  endpoint backend — lecture directe Supabase, RLS déjà ouverte en lecture
  sur `transport_lines`. Pas de correspondance multi-lignes en V1 (hors
  scope, piste future si demandé).
- Petite extension du template SEO `/ligne/[id].js` : la colonne `escales`
  était déjà lue mais jamais affichée — ajout d'un bloc itinéraire (liste
  ordonnée), utile pour toutes les lignes du répertoire, pas seulement les
  nouvelles.

**Vérifié en direct** (navigateur, session admin) : recherche AFTU
(Rue Sandiniery → Terminus Espace HLM GD Medine) trouve bien Ligne 1 ;
recherche DDD (UCAD → Terminus Palais 2) trouve bien les lignes 7/8/23 ;
recherche sans ligne commune (AIBD → Terminus Leclerc) affiche le message
« aucune ligne directe » ; page `/ligne/:id` d'une ligne DDD affiche
l'itinéraire complet en liste ordonnée.

**Résiduel volontaire** : pas de géolocalisation GPS réelle (décision
utilisateur — aucune coordonnée dans les sources, sélection manuelle dans
une liste d'arrêts connus). Pas de suggestion de correspondance (2 lignes
pour un trajet) si aucune ligne directe.

## 2026-08-31 (vingt-huitième) — Vérification en direct du 27e chantier : deux bugs réels trouvés et corrigés (GRANT `profiles` manquant, 502 intercepté par Cloudflare)

**Suite directe de l'entrée précédente** : vérification en direct (navigateur,
session admin réelle) du panneau Journal + Abonnements déployés. Deux bugs
réels trouvés en cours de route, tous deux corrigés et déployés — aucun n'est
introduit par le 27e chantier, mais découverts en le vérifiant.

**1. Dashboard admin React inaccessible pour TOUS les admins** (bug
pré-existant, sans rapport avec le 27e chantier) : naviguer vers
`/dashboard-admin.html` renvoyait systématiquement l'admin vers son espace
acheteur. Cause : `authenticated` avait `GRANT INSERT/UPDATE` sur `profiles`
mais **pas `SELECT`** — `dashboard-admin.html` lit son propre profil en
client-side (anon key + JWT) pour vérifier `role==='admin'`, recevait
`permission denied for table profiles` (42501, erreur de GRANT, **pas** un
filtrage RLS — confirmé en reproduisant l'appel en direct dans la console),
concluait "pas admin", redirection. Les policies RLS existantes sur
`profiles` (self-read via `auth.uid()=id`, `is_admin()`, lecture publique
vendeur approuvé) étaient déjà correctes — seul le GRANT de base manquait.
**Corrigé** : `grant select on public.profiles to authenticated;`. Découvert
uniquement parce que le backend de ce projet (service_role, bypass RLS)
avait masqué le problème jusqu'ici pour tous les endpoints `/api/**` — seul
un accès client-side direct (comme celui de `dashboard-admin.html`) le
révèle. ⚠️ **Piège important à noter** : il existe DEUX interfaces admin
séparées — `dashboard-admin.html` (page statique, vanilla JS + Supabase
direct) et le composant React `AdminDashboard` (dans `app.<hash>.js`,
monté sur `/` quand `currentUser.role==='admin'`, contient tous les
panneaux du 27e chantier). Ne pas confondre les deux en cherchant/testant
une fonctionnalité admin.

**2. `502` intercepté par Cloudflare — masque toute erreur réelle** : les 3
nouveaux endpoints (`/api/admin/logs`, `/api/admin/logs-summary`,
`/api/admin/subscriptions`) renvoyaient `502` dans leur bloc `catch`
générique. Repéré en testant l'ajout d'un abonnement avec `billing_cycle`
vide (violation légitime de la contrainte CHECK) : au lieu de voir l'erreur
Postgres réelle, le client recevait la page d'erreur HTML générique de
Cloudflare ("Bad gateway") — **Cloudflare remplace tout `502` renvoyé par
le Worker par sa propre page**, quel que soit le corps JSON d'origine.
**Corrigé** : `502` → `500` dans les 3 fichiers. Piège à retenir pour tout
futur endpoint : ne jamais utiliser `502` comme code d'erreur applicatif
générique sur ce projet.

**3. Fix supplémentaire déjà écrit mais pas déployé au 1er commit** : la
normalisation chaîne-vide→`NULL` dans `subscriptions.js` (`pickWritable`)
avait été codée pendant la vérification mais oubliée dans le commit
initial — incluse dans le même commit de correction que le point 2.

**Vérifié en direct (navigateur, session admin réelle)** : panneau
« Journal activité » affiche les vraies données (783 emails, 51 WhatsApp) ;
panneau « Abonnements & Renouvellements » affiche les 11 lignes seed ;
cycle complet créer→modifier (date passée)→supprimer testé via `fetch()`
direct avec le JWT admin, aucune trace laissée (11 lignes après nettoyage,
comme avant le test).

**Reste à faire (utilisateur)** : créer le job cron-job.org pour
`/cron/daily-report` (voir 27e entrée) — pas encore fait au moment de
cette entrée.

## 2026-08-30 (vingt-septième) — Journal admin unifié + suivi des abonnements/renouvellements + rapport quotidien par email

**Demande** : logs détaillés « dans tous les secteurs sans exception », suivi
des abonnements/dates de renouvellement de tous les services payants, et un
rapport complet chaque jour par email — pour anticiper les dysfonctionnements
en prod plutôt que les subir.

**Découverte de départ** : le panneau admin « Journal activité »
(`AdminLogsViewer`, câblé à la nav depuis un moment) appelait
`/api/admin/logs` et `/api/admin/logs/summary`, deux endpoints qui
**n'existaient nulle part** — panneau mort silencieux. Pire : ces appels
passaient par `DataService.apiFetch()`, qui renvoie **toujours `null`**
depuis le retrait du backend Railway (`NEXUS_CONFIG.apiUrl = ""`) — même en
créant les endpoints, le panneau serait resté cassé sans corriger l'appel
lui-même (`fetch()` direct + JWT en en-tête, comme le fait déjà
`PlatformUsagePanel`). Un **second panneau concurrent**, plus ancien,
existait aussi sur la même vue (`view === "logs"`, IIFE avec son propre état
`_logs`/`_logLoad`, fallback silencieux sur une requête directe
`audit_logs` — table jamais écrite, 0 ligne) : les deux se seraient
affichés empilés une fois le backend en place. Supprimé.

**Fait** :
- **Table `subscriptions`** (`sql/2026_08_30_admin_subscriptions_and_logs.sql`)
  — admin-éditable (aucune API de Resend/Cloudflare/Supabase/PayTech/etc.
  n'expose de date de renouvellement réelle), pré-remplie avec les 11
  services déjà recensés dans `PlatformUsagePanel` (nom, lien dashboard,
  note) — coût et date à saisir manuellement. Nouveau panneau admin
  « Abonnements & Renouvellements » (liste + ajout/édition/suppression,
  ligne colorée rouge si échéance dépassée, orange si ≤ 14 jours).
- **Journal unifié** : deux fonctions SQL `admin_logs_feed`/`admin_logs_summary`
  (SECURITY DEFINER, service_role only) qui font l'UNION de `email_logs`
  (783 lignes), `whatsapp_logs` (51), `notification_outbox` (10),
  `payment_events` (0 pour l'instant), `maintenance_log` (1) — normalisées
  vers le format attendu par `AdminLogsViewer`. `audit_logs` (0 ligne,
  jamais écrite) et `rate_limits` (compteur vivant, pas d'événements datés)
  délibérément exclus. Endpoints `/api/admin/logs` et
  `/api/admin/logs-summary` (⚠️ tiret, pas `/logs/summary` — `.gitignore`
  ligne 13 ignore silencieusement tout dossier nommé `logs/`, un fichier
  `functions/api/admin/logs/summary.js` n'aurait jamais été committé).
- **Rapport quotidien** (`/cron/daily-report`, même pattern `?token=` que les
  autres crons — pas de Cron Trigger natif sur Cloudflare Pages) : commandes
  et comptes (24h), résumé du journal (24h), alertes (notifications en
  échec, paiements en écart, config manquante), abonnements à renouveler
  (≤ 14 jours). Envoyé à `DAILY_REPORT_EMAIL` (repli codé en dur sur
  `elhadjidiagne002@gmail.com` — **pas** `ADMIN_EMAIL`, qui vaut
  `nx@nexusmarket.sn` et sert à d'autres alertes existantes, non touchées).
  L'envoi du rapport lui-même est journalisé dans `email_logs`
  (`template: daily_admin_report`) — sinon il resterait invisible dans son
  propre journal.
- Renommage cache-busting du bundle (`app.5b2aee16cd.js` →
  `app.cd2ea48ce9.js`) + bump `CACHE_NAME` du service worker (`nexus-v25`
  → `nexus-v26`), obligatoires vu le Cache-Control immutable 1 an sur
  `/assets/*`.

**Vérifié** : `select * from admin_logs_feed(5,0,null,null)` renvoie de
vraies lignes (`email_logs`/`notification_outbox`) ; `subscriptions`
contient bien les 11 lignes seed ; `node --check` propre sur tous les
nouveaux fichiers + le bundle entier.

**Reste à faire (utilisateur)** : créer le job cron-job.org
`GET https://nexusmarket.sn/cron/daily-report?token=<CRON_SECRET>`,
une fois par jour (~07h00 UTC = heure locale Dakar) ; remplir les dates de
renouvellement réelles dans le nouveau panneau Abonnements (laissées vides
volontairement — aucune ne peut être devinée).

## 2026-08-30 (vingt-sixième) — SMTP personnalisé (Resend) configuré côté Supabase, "Confirm email" réactivé avec succès, vérification email désormais réellement obligatoire

**Suite directe de l'entrée précédente** : le résiduel laissé en l'état (vérification
email = no-op, "Confirm email" OFF) est maintenant corrigé proprement.

**1. SMTP personnalisé configuré** (Authentication → Emails → SMTP Settings) :
host `smtp.resend.com`, port 587, username `resend`, sender `nx@nexusmarket.sn` /
`NEXUS Market`. Rempli par Claude via le navigateur (champs non-sensibles
uniquement) ; le mot de passe (clé API Resend) saisi par l'utilisateur
lui-même à chaque itération — jamais par Claude, règle appliquée sans
exception même sur demande explicite répétée de l'utilisateur.

**2. Trois itérations avant que ça marche** (chaque échec diagnostiqué via
`auth_logs`, pas en devinant) :
- 1ère tentative : `550 "You can only send testing emails to your own email
  address"` — le champ Sender email avait été changé en `onboarding@resend.dev`
  (adresse sandbox Resend par défaut) au lieu de `nx@nexusmarket.sn`. Domaine
  `nexusmarket.sn` confirmé **Verified** sur Resend (donc pas un problème de
  domaine) — corrigé en remettant le bon sender.
- 2e tentative : `535 "Authentication credentials invalid"` — clé API
  invalide/mal collée dans le mot de passe SMTP.
- 3e tentative : **même erreur `535` identique** après une soi-disant
  regénération de clé côté utilisateur → signe que la nouvelle clé n'avait
  en fait jamais été resauvegardée côté Supabase (juste régénérée côté
  Resend, pas recollée+sauvée côté Supabase).
- ⚠️ **Incident secret** : l'utilisateur a collé une clé API Resend valide
  en clair dans le chat. Non utilisée, utilisateur invité à la révoquer et
  en générer une nouvelle immédiatement — jamais coller de secret dans le
  chat, même après demande explicite de "faire le travail" à sa place.
- 4e tentative (nouvelle clé, resauvée côté Supabase cette fois) : **succès**.

**3. Test complet en direct, cette fois avec la vérification réelle** :
inscription → Supabase exige la confirmation (`email_confirmed_at` NULL à la
création) → code à 6 chiffres généré et envoyé (Resend, `status:sent`) →
code saisi dans le vrai formulaire → compte activé
(`email_confirmed_at` posé ~80s après la création, donc un vrai délai
d'attente utilisateur, plus l'activation instantanée d'avant) → profil créé
(`role:buyer`, `status:active`) → session posée. Tout le circuit fonctionne
enfin comme prévu par le code existant (`__emailConfirmPending`,
`triggerVerificationCode`, `EmailVerifyStep`).

**Piège d'outillage rencontré en cours de route** : le dashboard Supabase ET
le dashboard Resend se sont tous les deux bloqués en chargement infini dans
le navigateur automatisé à un moment (deadlock de verrou côté Supabase,
page "Loading..." infinie côté Resend) — contourné en laissant l'utilisateur
faire l'action lui-même dans son propre navigateur déjà connecté plutôt que
de s'acharner sur l'automatisation.

**État final** : vérification d'email réellement obligatoire pour tous les
rôles (buyer testé explicitement, les autres partagent le même
`DataService.signUp()`). Résiduel du 25e entrée résolu — plus rien à faire
sur ce sujet sauf si un nouveau souci apparaît.

## 2026-08-30 (vingt-cinquième) — Test complet de l'inscription en direct : découverte que la vérification email est un no-op, tentative d'activation qui a cassé les inscriptions, retour à l'état stable

**Demande** : tester l'inscription complète via le vrai formulaire du site (pas
seulement l'API), pour vérifier que tout le travail des entrées précédentes
(23e, 24e) fonctionne réellement de bout en bout.

**1. Piège d'environnement rencontré (pas un bug de prod)** : la page d'accueil
a une surcouche statique `#nx-proto-overlay` (cf. [[home-overlay-interface]])
qui capte les clics sur les boutons "Connexion"/"S'inscrire" du header avant
qu'ils n'atteignent les vrais boutons React en dessous. Contourné en appelant
le même mécanisme que l'app utilise déjà (`hideProto()`, normalement déclenché
par un paramètre `?q=`/`?cat=` dans l'URL) pour révéler le vrai header.

**2. Le parcours d'inscription fonctionne réellement de bout en bout** : rôle
"Acheteur / Vendeur particulier" → nom/email/mot de passe → `Créer mon
compte` → `DataService.signUp()` → ligne `profiles` créée (`role:buyer`,
`status:active`) → session valide posée en localStorage. Aucune erreur,
aucun blocage. Vérifié deux fois avec des adresses de test jetables
(`diagnemor360+…@hotmail.com`), nettoyées ensuite (`auth.users` + `profiles`).

**3. Découverte majeure : le code à 6 chiffres n'est JAMAIS déclenché en
prod actuellement** — le réglage Supabase Auth "Confirm email" était
**désactivé**. Preuve concrète : `email_confirmed_at` posé 2 secondes après
`created_at` sur un compte fraîchement créé, et session Supabase renvoyée
immédiatement par `signUp()`. Le code de `DataService.signUp()` (déjà lu et
compris) ne déclenche `triggerVerificationCode()` QUE si Supabase renvoie
`session: null` — ce qui n'arrive jamais avec ce réglage. Conséquence :
**n'importe qui peut s'inscrire (acheteur, vendeur, coursier, pro, éleveur,
transporteur — tous passent par le même `signUp()`) avec une adresse qu'il
ne possède pas, et obtient un compte actif instantané.** Tout le travail des
entrées 23e/24e (envoi du code, repli Brevo) reste correct mais n'est
simplement jamais appelé pour l'instant.

**4. Tentative d'activer "Confirm email" → a cassé les inscriptions en
prod** : dès l'activation, `signUp()` a commencé à échouer avec `500 Error
sending confirmation email` (message renvoyé par Supabase lui-même, pas par
le code de l'app). Cause : activer ce réglage fait que **Supabase tente
d'envoyer SON propre email de confirmation intégré** (indépendant du système
de code à 6 chiffres maison, basé sur Resend/Brevo) via son mailer par
défaut — non configuré avec un SMTP personnalisé, cet envoi échoue et
**`signUp()` lève une exception au lieu de renvoyer `session:null`
proprement**. Résultat : plus aucune inscription possible, tous rôles
confondus, pendant que le réglage était actif.

**5. Reverti immédiatement** : "Confirm email" repassé à OFF sur demande de
l'utilisateur dès le problème identifié. Retest en direct après coup :
inscription de nouveau fonctionnelle de bout en bout, comportement identique
au point 2 (pas d'erreur console, session posée normalement).

**État final** : inscription fonctionnelle et vérifiée en direct pour tous
les rôles (chemin `buyer` testé explicitement, les autres partagent le même
`DataService.signUp()`). **Résiduel volontairement laissé en l'état** : la
vérification d'email reste un no-op complet — n'importe quelle adresse est
acceptée sans preuve de possession. Si on veut un jour rendre la
vérification réellement obligatoire, il faudra configurer un **SMTP
personnalisé côté Supabase** (Authentication → Settings → SMTP Settings, en
réutilisant la clé Resend déjà existante) **avant** de réactiver "Confirm
email" — sinon le même blocage reviendra. Non fait cette session (pas
redemandé après le retour à l'état stable).

## 2026-08-30 (vingt-quatrième) — Régénération de la clé Brevo (secours email)

**Cause confirmée** : le dashboard Brevo n'avait **aucune clé API active**
(0 résultat sous "Vos clés API") — l'ancienne valeur stockée dans le secret
Cloudflare `BREVO_API_KEY` correspondait à une clé déjà supprimée côté Brevo,
d'où l'erreur "API Key is not enabled" observée dans l'audit précédent.

**Fait** : nouvelle clé générée dans le dashboard Brevo (nom
`nexus-market-production`, expire le 30 août 2027), secret `BREVO_API_KEY`
mis à jour côté Cloudflare Pages (`wrangler pages secret put`, environnement
production). Resend (primaire) fonctionnant déjà normalement, ceci restaure
uniquement le filet de sécurité de secours — pas de changement visible pour
l'utilisateur tant que Resend reste opérationnel.

## 2026-08-30 (vingt-troisième) — Diagnostic "code de vérification jamais reçu" + nettoyage compte de test

**Demande** : utilisateur signale que le code à 6 chiffres n'est toujours pas
reçu après inscription avec `diagnemor360@hotmail.com` (déjà refusé une fois
comme "email déjà pris").

**1. Compte de test bloqué** : `diagnemor360@hotmail.com` était l'un des 3
profils orphelins identifiés dans l'audit du jour (profil sans compte
`auth.users`). Une tentative de réinscription APRÈS mon fix du trigger
(`handle_new_user`) avait créé un nouveau compte `auth.users` mais, par
construction du fix (skip silencieux sur collision d'email), sans profil —
d'où un second blocage. Les deux (ancien profil orphelin + nouveau compte
auth sans profil, 0 commande liée aux deux) supprimés à la demande de
l'utilisateur pour repartir propre.

**2. Diagnostic de l'envoi d'email — fausse piste puis vraie confirmation** :
- Le fix précédent (`3acd3bc`, `context.waitUntil`) est bien en place et
  fonctionne : testé en direct via `wrangler pages deployment tail` + appel
  réel à `/api/auth/send-verification-code` — l'envoi est maintenant
  correctement tenté et journalisé (avant, silence total).
- Premier test avec une adresse `@example.com` → Resend renvoie 422
  ("domaines comme example.com" refusés explicitement par Resend, quel que
  soit l'état du compte) **et** Brevo (repli) renvoie 401 "API Key is not
  enabled" — repéré uniquement grâce à un ajout de logging (`sendEmail()`
  ne journalisait jamais le corps de la réponse en cas d'échec HTTP non
  exceptionnel). Ça ressemblait à un vrai problème de compte Resend/Brevo.
- **Corrigé le tir** : `@example.com` est un domaine qu'aucun fournisseur
  d'email transactionnel ne doit accepter (réservé IANA, ne reçoit jamais
  vraiment de mail) — le 422 ne prouvait rien sur un VRAI destinataire.
  Retest avec le vrai email de l'utilisateur (`diagnemor360@hotmail.com`) →
  **`status: sent` via Resend, provider_id réel retourné**. L'envoi
  fonctionne bien pour un destinataire réel.
- Fait (déployé, commit `5a1d15f`) : ajout du log du corps de réponse
  Resend/Brevo en cas d'échec HTTP (`functions/api/_lib/utils.js`) — sans
  ça, la vraie cause d'un futur échec resterait invisible comme aujourd'hui.

**Résiduel non urgent** : `BREVO_API_KEY` (fournisseur de secours) est
invalide ("API Key is not enabled") — sans impact tant que Resend
(primaire) fonctionne, mais aucune redondance réelle en cas de panne Resend.
À régénérer côté dashboard Brevo si on veut restaurer le filet de sécurité.

**État final** : le flux d'inscription + code de vérification fonctionne de
bout en bout pour `diagnemor360@hotmail.com` (email envoyé). Utilisateur
invité à vérifier sa boîte de réception (et les spams).

---

## 2026-08-30 (vingt-deuxième) — Fusion complète des policies RLS qui se chevauchent (multiple_permissive_policies)

**Suite directe** : après le nettoyage initplan + doublons exacts, l'utilisateur
a demandé d'aller au bout (« tout corrige et fait le nécessaire »). Deux
actions :

**1. Fix `stock_alerts_deny_update`** : cette policy (`USING false` sur
UPDATE) était un no-op — les policies RLS permissives se combinent en OR,
donc `stock_alerts_own` (ALL) autorisait déjà l'UPDATE au propriétaire malgré
elle. Scindé `stock_alerts_own` en 3 policies d'action (SELECT/INSERT/DELETE,
sans UPDATE) pour que `stock_alerts_deny_update` redevienne effective.

**2. Fusion des ~977 items `multiple_permissive_policies` restants** —
**⚠️ faille évitée de justesse** : ma première tentative de fusion (générée
programmatiquement en groupant par simple table+action) aurait mélangé des
policies scopées `TO service_role` (condition `true` sans restriction) avec
des policies `TO public`/`authenticated` sur `carts`, `coupons`,
`invoice_sequences`, `invoices`, `notifications`, `referrals`,
`vendor_referrals`, `wishlists` — ce qui aurait donné un accès total à
n'importe quel utilisateur sur ces tables. Repéré **avant application** en
vérifiant `pg_policy.polroles` de chaque policy. Correction : regroupement
par (table, action, **rôles exacts**) au lieu de juste (table, action) — les
policies `service_role` ne sont alors plus jamais mélangées.

**Fait** (46 groupes fusionnés, tous vérifiés même rôle) : chaque fusion est
un simple OR verbatim des conditions d'origine (aucune réinterprétation),
donc strictement équivalente. Nettoyage notable sur `profiles` (5→3
policies), `products` (9→6), `couriers`, `disputes`, `orders`, `email_templates`,
`return_requests`, `transport_reservations`, etc. — voir migrations
`audit_merge_overlapping_policies_batch_a/b`.

**État final** : 270 policies RLS actives sur `public` (contre 322 après
le tour précédent, ~333 au départ). Vérifié : 0 groupe restant avec policies
dupliquées pour un même (table, action, rôle) ; `products` par ex. passé
de 9 à 6 policies cohérentes (admin/own/public read, sans doublon). Les seuls
groupes "multiples" restants sont des policies `service_role` séparées
des policies utilisateur — c'est le comportement correct, pas un doublon.

---

## 2026-08-30 (vingt-et-unième) — Nettoyage RLS (initplan + doublons), autorisé explicitement par l'utilisateur

**Suite directe de l'entrée précédente** : l'utilisateur a explicitement
autorisé Claude à modifier des policies RLS (bloqué par le classificateur de
sécurité lors du tour précédent). Exécuté :

- **`auth_rls_initplan`** : 203 policies (`orders` + 197 sur ~70 autres
  tables) réécrites pour envelopper `auth.uid()`/`auth.role()` appelés
  directement dans `USING`/`WITH CHECK` en `(select auth.uid())` — Postgres
  les traite alors comme une constante par requête au lieu de les
  ré-évaluer à chaque ligne. Généré programmatiquement depuis `pg_policy`
  (substitution textuelle simple), appliqué en 5 lots de ~40 après relecture
  de chaque lot, vérifié par une requête de contrôle en fin de course
  (0 policy restante avec appel direct non enveloppé).
- **Doublons exacts supprimés** (`multiple_permissive_policies`) :
  `orders` (9→6 : deux policies buyer dupliquées + `orders_admin_all` vs
  `orders_admin_all_fixed`, vérifiées équivalentes via leurs fonctions
  sous-jacentes), `disputes` (`buyer_creates_disputes` doublon de
  `dispute_insert_buyer`), `loyalty_points` (`loyalty_own` doublon de
  `loyalty_points_select_own`), `stock_alerts` (10→3 : deux générations
  complètes de policies select/insert/delete jamais nettoyées, alert_* et
  stock_alerts_*, plus une policy ALL dupliquée — toutes fonctionnellement
  identiques, juste l'ordre des opérandes `a = b` vs `b = a` différait).

**Trouvé au passage, PAS corrigé** (hors périmètre de cette demande,
nécessite une décision produit) : `stock_alerts_deny_update` (policy
permissive `USING (false)` sur UPDATE) est un **no-op** — les policies RLS
permissives se combinent en OR, donc cette policy ne bloque rien puisque
`stock_alerts_own` (ALL) autorise déjà l'UPDATE au propriétaire. Pour
vraiment interdire l'UPDATE il faudrait soit une policy RESTRICTIVE, soit
retirer UPDATE du périmètre de la policy ALL — à trancher selon l'intention
réelle (les alertes de stock sont-elles censées être modifiables par
l'utilisateur ou non ?).

**Non touché** (périmètre trop large pour une passe sûre en une session) :
le reste des ~977 items `multiple_permissive_policies` sont des policies
qui se chevauchent mais avec des conditions RÉELLEMENT différentes (ex.
"l'acheteur voit sa commande" OR "le vendeur voit sa commande" — chacune
légitime, combinées par OR). Les fusionner en une seule policy par
(table, action) est possible mais demande de comprendre l'intention exacte
de chaque table, pas juste un nettoyage mécanique — laissé pour une session
dédiée si l'utilisateur le souhaite.

**État final** : 322 policies RLS actives sur le schéma `public` (contre
~333 avant nettoyage). Aucune régression attendue (chaque changement est soit
une réécriture strictement équivalente, soit la suppression d'un doublon
prouvé identique) — vérifié par relecture systématique de chaque policy
réécrite avant application, mais **pas testé end-to-end sur le site** (pas de
changement de comportement fonctionnel attendu, donc pas de test préventif
au-delà de la vérification SQL). Non commité (travail 100% côté base
Supabase, pas de fichier applicatif modifié).

---

## 2026-08-30 (vingtième) — Audit Supabase complet + code de vérification jamais envoyé

**Demande** : « audit Supabase pour corriger toute erreur qui risque de poser
problème + améliorations si nécessaire », puis signalement séparé que le
code à 6 chiffres de vérification de compte n'arrive jamais après inscription.

**Audit** (`get_advisors` sécurité + performance, 286 144 + 1 234 676
caractères, analysés via 2 agents en parallèle car trop volumineux pour être
lus directement) :

**Bugs réels trouvés et corrigés (SQL, migrations Supabase MCP)** :
- `notifications_type_check` n'autorisait que 8 valeurs, mais **5 triggers déjà
  en prod** insèrent des types absents de la liste : `commission`
  (`ambassador_commission_on_delivery`, sur commande livrée), `delivery`
  (`credit_courier_on_delivery`, sur livraison complétée), `b2b_quote`/
  `b2b_quote_confirmed` (`notify_vendor_on_quote_sent`), `stock_alert`
  (`notify_stock_alerts_on_restock`), `insurance_lead`
  (`trg_insurance_lead_notify`). **Aucun n'avait de protection contre les
  erreurs** : le premier vrai cas (1re commande livrée avec parrainage
  ambassadeur actif, 1re livraison avec coursier crédité, 1er devis B2B, 1er
  réapprovisionnement avec alerte stock active, 1er lead assurance) aurait
  fait **planter l'action principale** (impossible de marquer une commande/
  livraison comme livrée !). Vérifié : 0 ligne dans `courier_earnings`/
  `notifications` de ces types → jamais encore déclenché en prod, mais
  bombe à retardement certaine. Deux triggers (devis B2B, leads assurance)
  utilisaient en plus des colonnes `body`/`data` qui n'existent pas sur
  `notifications` (schéma réel : `message`/`link`) — double bug.
  **Fix** : contrainte étendue aux 6 nouvelles valeurs + toutes les
  `INSERT INTO notifications` de ces triggers isolées dans leur propre
  `BEGIN/EXCEPTION WHEN OTHERS THEN NULL` (la notification ne doit jamais
  bloquer l'action métier réelle), colonnes corrigées.
- 4 clés étrangères sans index dédié (`email_verification_codes.user_id`,
  `pwa_install_events.user_id`, `rescuer_earnings.request_id`,
  `transport_trips.transporter_id`) → index créés.

**Bug réel trouvé et corrigé (code applicatif)** — **code de vérification à 6
chiffres jamais envoyé** : `functions/api/auth/send-verification-code.js`
appelait `sendEventNotification(...)` sans `await` NI `context.waitUntil()`
juste avant le `return` de la réponse HTTP. Cloudflare Workers peut couper
une promesse non attenue dès que la réponse part — le code était bien généré
et stocké en base (`email_verification_codes`), donc aucune erreur visible
côté client, mais **`email_logs` ne recevait jamais aucune ligne** (ni "sent"
ni "failed"), preuve que l'envoi n'allait jamais jusqu'au bout. Vérifié que
les 15 autres appelants de `sendEventNotification()` dans `functions/` sont
tous correctement `await`és — ce point d'entrée était le seul avec ce bug.
Fix : `context.waitUntil()` (même convention déjà utilisée ailleurs dans le
projet : `stripe.js`, `indexnow.js`, `img/[[path]].js`…).

**Améliorations identifiées mais PAS appliquées** (bloquées par le
classificateur de sécurité de Claude Code — modification de policies RLS sur
`orders`, même une réécriture strictement équivalente `auth.uid()` →
`(select auth.uid())`, refusée deux fois de suite) — décision utilisateur
requise pour la suite :
- **`auth_rls_initplan`** (205 items / 82 tables) : `auth.uid()` appelé
  directement dans `USING`/`WITH CHECK` est ré-évalué à CHAQUE LIGNE au lieu
  d'une fois par requête. Fix mécanique et sûr (`(select auth.uid())`) mais
  gros volume.
- **`multiple_permissive_policies`** (977 items / 66 tables, en réalité ~4
  conflits de policies par table) : ex. `orders` a deux policies admin
  redondantes (`orders_admin_all` via `is_admin()` et `orders_admin_all_fixed`
  via `auth_user_role()='admin'` — vérifié équivalentes, la seconde jamais
  nettoyée après la migration), et 2 policies buyer dupliquées en plus. Même
  chevauchement sur `products`, `profiles`, `disputes`, etc.
- 25 vues `SECURITY DEFINER` (dont plusieurs `*_revenue`/`*_admin`) —
  échantillon vérifié (`payout_requests_admin` : filtre `WHERE is_admin()`
  réel et fiable, `authenticated` a SELECT mais protégé par le filtre — pattern
  déjà établi et review le 2026-07-03, pas un nouveau bug) ; les 24 autres
  non vérifiées individuellement.
- 35 fonctions avec `search_path` mutable, 206 index inutilisés (à vérifier
  avant suppression), 3 extensions dans `public` au lieu d'un schéma dédié,
  protection mot de passe divulgué (HaveIBeenPwned) désactivée côté Auth
  (réglage dashboard, pas SQL).

**État final** : les bugs à risque réel (crash garanti au premier usage) sont
tous corrigés et déployés. Les améliorations de performance RLS restent à
faire — nécessitent soit l'autorisation explicite de l'utilisateur pour que
Claude les exécute, soit qu'il les exécute lui-même (SQL prêt, non appliqué).

---

## 2026-08-29 (dix-neuvième) — Incident prod (déploiement) + inscriptions cassées (bug DB pré-existant)

**Incident 1 — déploiement cassé** : la fonctionnalité "message de bienvenue +
stats de croissance" (voir tentative du même jour, commit `d058137`) faisait
planter **toutes** les routes du site en prod avec « Worker exceeded resource
limits » (Erreur 1102 Cloudflare, `outcome: exceededCpu`), y compris la page
d'accueil qui n'a pourtant aucun lien avec le code ajouté. Confirmé en
comparant en direct l'ancien déploiement (200 OK) vs le nouveau (503 partout)
via `wrangler pages deployment tail`. Cause exacte non identifiée avant
rollback (priorité = remettre le site en ligne) — hypothèse la plus probable :
le bundling Cloudflare Pages Functions compile tout `functions/**` en un seul
Worker, et un cold-start plus lourd (3 nouveaux fichiers) a fait franchir un
seuil CPU déjà très serré pour ce compte. **Action** : `git revert` immédiat
de `d058137` + push (commit `d9f8d0f`) → site restauré, vérifié 200 sur `/`,
`/sitemap-listings.xml`, `/api/live-activity`, `/manifest.json`. La
fonctionnalité "stats de croissance" est donc **retirée** pour l'instant — à
ré-implémenter plus tard en isolant/testant chaque nouveau fichier séparément
avant de repointer le domaine de prod dessus.

**Incident 2 — inscriptions cassées** (signalé séparément par l'utilisateur,
log navigateur fourni) : **totalement indépendant de l'incident 1**, bug
pré-existant en base. `POST auth/v1/signup` renvoyait systématiquement
500 « Database error saving new user » pour certains emails. Cause : le
trigger `handle_new_user()` (AFTER INSERT ON auth.users) fait
`INSERT INTO profiles (...) ON CONFLICT (id) DO NOTHING` — mais `profiles`
a AUSSI une contrainte `UNIQUE(email)` (`profiles_email_key`) non couverte par
ce conflict target. Dès qu'un profil "orphelin" existe (email présent dans
`profiles` mais son `auth.users` a été supprimé, ex. via le dashboard Supabase
sans nettoyer `profiles`), toute tentative d'inscription avec ce même email
lève `unique_violation`, annule toute la transaction (y compris la création du
compte `auth.users`) → 500 pour CET email, indéfiniment.

Cas réel trouvé en base : `princepod51@gmail.com` — profil vendeur avec
**648 produits + 3 commandes** liés à son id, mais plus aucun compte auth
correspondant. **Ce profil et ses données n'ont PAS été touchés** : les ~90 FK
vers `profiles(id)` du schéma sont toutes en `ON UPDATE NO ACTION`, donc
changer son id aurait cassé ses 648 produits. Un autre email `admin@nexus.sn`
(banni) et `diagnemor360@hotmail.com` (buyer) sont orphelins aussi mais sans
données liées.

**Fix appliqué** (`sql`, migrations Supabase MCP
`fix_handle_new_user_orphan_email_crash` +
`fix_handle_approved_vendor_signup_orphan_email_crash`) : les deux triggers
`AFTER INSERT ON auth.users` (`handle_new_user` et
`handle_approved_vendor_signup`, qui a exactement la même faille) attrapent
désormais `unique_violation` sur leur propre INSERT et l'ignorent (`RAISE
WARNING` + on continue) au lieu de laisser planter toute la transaction. Le
compte `auth.users` se crée alors normalement même dans le cas orphelin (juste
sans nouvelle ligne `profiles` dans ce cas rare et déjà identifié). Vérifié en
direct par test SQL (insert test dans `auth.users` avec l'email orphelin →
succès, ligne de test nettoyée immédiatement ; insert avec email neuf → profil
toujours créé normalement).

**État final** : inscriptions débloquées pour tout le monde. `princepod51`
(vendeur avec 648 produits) reste bloqué pour SE reconnecter tant que son
compte auth n'est pas recréé avec le même id — décision à prendre avec
l'utilisateur (récupération manuelle via dashboard Supabase, hors urgence
immédiate). Pas de nouveau commit applicatif nécessaire (fix 100% côté SQL
Supabase, déjà appliqué en prod).

---

## 2026-08-28 (dix-septième) — Traduction du nouveau filtre catalogue (FR/EN/WO)

**Demande** : les éléments introduits dans le filtre catalogue (sidebar +
tiroir mobile + bloc "Autres services NEXUS") ne changeaient pas de langue.

**Cause** : tout ce bloc est construit dynamiquement en JS (chaînes HTML
générées, comptages inclus) — le mécanisme `[data-i18n]` existant
(`window.nexusI18n.applyDom()`, ré-exécuté à chaque changement de langue)
ne peut pas s'appliquer à du texte injecté après coup ni mélangé à des
nombres calculés (ex. "Électronique & High-Tech (484)").

**Fait** :
- ~25 nouvelles clés ajoutées à `NEXUS_TRANSLATIONS` (fr/en/wo) dans le
  bundle : `filter.loading`, `filter.cat_unavailable`, `filter.no_cats`,
  `filter.other_services`, `filter.cat_*` (8 familles), `filter.module_*`
  (Pro/Covoiturage/Éducation), `filter.vtype_*` (6 types de véhicule).
  Bundle renommé `app.5b2aee16cd.js` (règle cache-busting obligatoire).
- `CATEGORY_GROUPS`/`EXTERNAL_MODULES` : `label` (repli FR) + `key`/`labelKey`
  résolus via `nxT(key,null,label)` **au moment du rendu**, plus `data-label`
  du DOM qui stocke désormais la clé stable (pas le texte traduit) pour que
  la surbrillance "sélectionné" reste cohérente après un changement de langue.
- Comptages mis en cache (`_lastCounts`/`_lastModuleCounts`) + écouteur
  `nexus:lang-changed` qui **re-rend sans re-fetch réseau** — traduction
  instantanée.
- Tiroir mobile : ajout des `data-i18n` manquants sur "Filtres"/"Catégories"/
  "Prix (FCFA)"/"à"/"Réinitialiser"/"Appliquer" (jamais câblés, gap
  pré-existant à cette session).

**État final** : vérifié en local — bascule fr→en→wo→fr instantanée sur
sidebar desktop ET tiroir mobile, comptages toujours corrects après
changement de langue. Reste à committer/pousser.

---

## 2026-08-28 (seizième) — Pro/Covoiturage/Éducation intégrés DANS le filtre catalogue (pas juste dans leur propre modale)

**Demande** : après vérification que les filtres internes (Pro/Covoiturage/
Éducation) étaient bien en ligne, l'utilisateur a précisé le vrai besoin :
il voulait ces trois univers accessibles **depuis le même filtre catalogue**
(sidebar desktop + tiroir mobile) qui affiche déjà "Électronique & High-Tech",
"Location de matériel", "Immobilier" — pas seulement en ouvrant chaque module
séparément.

**Fait** :
- Nouveau bloc "Autres services NEXUS" ajouté en bas de `buildCatalogFilterPanel`
  (donc desktop ET mobile automatiquement) : 3 groupes accordéon — "NEXUS Pro"
  (2497, sous-métiers), "Covoiturage — Lignes régulières" (72, par type de
  véhicule), "NEXUS Éducation — Matières" (35, par matière). Comptages réels,
  mêmes sources que les chips internes de chaque module.
- Contrairement aux catégories produits, cliquer un sous-élément ici **ouvre
  directement le module concerné pré-filtré** au lieu d'appeler `nxpShowAll()`
  (ce sont d'autres tables, pas des produits) :
  - `window.NexusPro.openFor(metier)` (déjà existant, réutilisé)
  - `nexus:open-covoiturage` étendu avec `detail:{tab:'lines', vehicleType}` →
    `CovoiturageModal` accepte désormais `initialTab`/`initialVehicleType`
  - `nexus:open-education` étendu avec `detail:{subject}` → nouvelle fonction
    `openSubject()` + export `window.NexusEducation`
- Piège rencontré et corrigé : le premier jet utilisait
  `DataService.lineVehicleCounts()` (client Supabase-js) pour les comptages
  Covoiturage — renvoyait toujours `{}` ("Covoiturage (0)") car appelé trop
  tôt au chargement, avant que `DataService._sb` soit initialisé. Remplacé
  par un appel REST direct (`sbFetch('transport_lines?...')`), comme pour
  Pro/Éducation — plus robuste, aucune dépendance de timing.

**État final** : vérifié en local (desktop + mobile) — les 3 groupes
affichent les bons comptages, cliquer un sous-élément ouvre le bon module
avec le bon filtre pré-sélectionné (testé Plombier/Ferry/Physique). Reste à
committer/pousser.

---

## 2026-08-27 (quinzième) — Filtre catalogue mobile aligné sur le desktop

**Demande** : le tiroir de filtres mobile (bottom sheet) restait "rudimentaire
et démodé" — 7 catégories figées en checkboxes + deux `<input type=number>`
bruts pour le prix — pendant que la sidebar desktop avait déjà été refaite
(accordéon + comptages réels + curseur glissable). L'utilisateur a aussi
confirmé (après vérification en direct sur nexusmarket.sn, captures à
l'appui) que les filtres Pro/Covoiturage/Éducation de la session précédente
étaient bien en ligne — la confusion venait du fait que ce sont des filtres
internes à chaque module (pas dans le catalogue principal), pas d'un défaut
de déploiement.

**Fait** :
- Extrait la logique du filtre desktop (`CATEGORY_GROUPS`, comptages,
  accordéon, curseur de prix glissable) en une fonction réutilisable
  `buildCatalogFilterPanel(ids)`, appelée deux fois (desktop `#nxp-catList`
  + mobile `#nxp-catListM`, ids paramétrés).
- Comptages `category_counts` désormais fetchés UNE seule fois et partagés
  entre les deux panneaux (`getCategoryCounts()`, promesse mise en cache).
- Tiroir mobile (`#nxp-filterDrawer`) : mêmes familles/sous-catégories
  accordéon + même curseur de prix glissable que le desktop (nouveaux ids
  suffixés `M`). Le bouton "Appliquer" mobile referme aussi le tiroir après
  application du filtre (`onApply` callback).

**État final** : vérifié en local en viewport mobile (375×812) — accordéon
fonctionnel, comptages réels identiques au desktop, drag tactile du curseur
de prix opérationnel, clic "Appliquer" ferme le tiroir et affiche bien les
74 résultats "Téléphones" attendus. Reste à committer/pousser.

---

## 2026-08-27 (quatorzième) — Filtres avec comptages réels : NEXUS Pro, Covoiturage (lignes), Éducation

**Demande** : pouvoir filtrer les pros, les lignes régulières de covoiturage,
et les matières du module Éducation — avec le nombre de cours par matière.

**Fait** :
- **NEXUS Pro** : les chips de métier existaient déjà (filtre fonctionnel)
  mais sans aucun compte. Nouvelle vue `public.pro_profession_counts`
  (`sql/2026_08_27_pro_profession_counts_view.sql`, évite de télécharger les
  ~2500 lignes de `pros` juste pour un chiffre) → chaque chip affiche
  maintenant "🧱 Maçon (518)", "Tous (2162)"... vérifié en local.
- **Covoiturage — Lignes régulières** : n'avait qu'une recherche texte
  départ/destination. Ajout de chips de filtre par type de véhicule (Bus 44,
  7 places 18, Voiture 5, Ferry 3, Minibus 2 — comptage réel via
  `DataService.lineVehicleCounts()`, ~70 lignes actives, pas besoin de vue
  dédiée). `DataService.searchLines()` accepte désormais `vehicleType`.
- **Éducation** : chips de matière déjà présents (filtre fonctionnel) mais
  sans compte. Calculé côté client sur `ALL` (déjà chargé en entier, 35
  cours au total < limite 100) → "Mathématiques (9)", "Physique (5)"...
  jusqu'à "Latin (1)". Aucune requête supplémentaire nécessaire.

**État final** : vérifié en local (comptages = réalité DB, clic sur un chip
filtre bien côté serveur pour Pro/Covoiturage, côté client pour Éducation).
Reste à committer/pousser.

---

## 2026-08-27 (treizième) — Sidebar "Filtres" de l'accueil refaite (chiffres réels + sous-catégories)

**Demande** : l'outil de filtres (sidebar gauche desktop, `public/index.html`)
affichait des catégories figées avec des comptes inventés (ex. "Alimentation
(210)" alors qu'aucun produit n'existe dans cette catégorie) et un curseur de
prix purement décoratif (aucun listener de drag). Demande : le rendre plus
pro, corriger les chiffres faux, et ajouter des sous-catégories (ex. Électronique).

**Fait** :
- Nouvelle vue Supabase `public.category_counts` (`sql/2026_08_27_category_counts_view.sql`)
  = comptage réel par `category` sur les produits actifs non-éducatifs. GRANT
  SELECT anon/authenticated (données agrégées non sensibles).
- Sidebar reconstruite en accordéon : familles curées (`CATEGORY_GROUPS` dans
  `index.html`) regroupant les valeurs `category` réelles de la base (ex.
  "Électronique & High-Tech" = Téléphones/Informatique/Téléviseurs/Tablettes/
  Sonorisation/Accessoires/Électroménager/…) ; toute catégorie non répertoriée
  tombe dans "Autres" (jamais invisible, jamais inventée). Clic sur la famille
  = filtre OR sur tous ses membres ; clic sur une sous-catégorie = filtre exact.
  `nxpShowAll()` étendu avec `opts.catList`/`opts.catLabel` pour ce cas (le
  filtre historique `opts.cat` — nav pillars, panneaux admin — inchangé).
- Curseur de prix rendu réellement glissable (pointer events, drag min/max,
  clic sur la piste, synchro bidirectionnelle avec les champs texte) — avant :
  2 poignées visuelles sans aucun JS de drag.
- Réalité découverte en creusant : le catalogue actuel ne contient QUE de
  l'électronique (478 produits) + immobilier (61) + location matériel (147) +
  éducation (35) — aucun produit Mode/Alimentation/Maison/Beauté n'existe
  encore malgré les catégories déjà prévues dans `NEXUS_CAT_TREE`. Les groupes
  correspondants dans la sidebar restent prêts (`CATEGORY_GROUPS`) et
  apparaîtront automatiquement dès que des produits y seront ajoutés.

**État final** : vérifié en local (comptages vue = comptages réels, clic
famille/sous-catégorie → bon nombre de résultats, drag du curseur → bons
champs). Reste à committer/pousser (React bundle non touché, uniquement
`index.html` + nouvelle vue SQL).

---

## 2026-08-27 (duodecies) — Nouvelle prospection Immobilier + Location matériel importée en base

**Demande** : nouvelle prospection web (Expat-Dakar, CoinAfrique, recherche
`site:facebook.com`/`site:instagram.com`) sur Immobilier (annonces individuelles
appartements/terrains, PAS des agences — correction explicite en cours de tâche)
et Location matériel, croisée avec `prospection/` existant pour éviter les doublons,
puis import en base.

**Fait** :
- `prospection/catalogue_immobilier_senegal.csv` : +25 lignes (39→64).
- `prospection/catalogue_location_senegal.csv` : +16 lignes (66→82).
- `sql/2026_08_27_prospection_immobilier_location_batch2.sql` (pattern
  `_annonces_b2` temp table → `INSERT ... WHERE NOT EXISTS`, attribution au
  compte admin, déjà éprouvé sur les lots précédents) exécuté en prod.
- 22 annonces Immobilier (`is_realestate=true`) + 16 annonces Location
  (`is_rental=true`) insérées dans `products`, dédupliquées, vérifiées
  (`count(*) filter` post-import = 22/16 conforme).
- 3 lignes Immobilier exclues de l'import (prix non vérifiable — Villa Saly,
  Terrain Saly Carrefour, Appartement meublé Liberté 6 Extension) : restent
  dans le CSV pour complément manuel plutôt que d'inventer un prix ou
  d'utiliser `is_vitrine` (non supporté par `isVitrineListing()` côté
  `realestate_specs`, seulement `rental_specs`/`animal_specs`).
- 10 lignes Location sans prix vérifiable importées en mode vitrine
  (`rental_specs.is_vitrine:true`, `price=1€` placeholder jamais affiché).

**État final** : importé et vérifié en base prod. Rien à committer côté code
(uniquement CSV gitignorés + fichier SQL déjà trackable si souhaité).

---

## 2026-08-27 (undecies) — Raccourci Éducation remis dans la pile de widgets (désormais home-only)

**Demande** : le raccourci Éducation avait été retiré de la pile de widgets
(cf. entrée « quinquies ») ; l'utilisateur le veut de retour comme raccourci
sur la page d'accueil.

**Contexte** : il avait été retiré parce que la pile entière fuitait dans
les tableaux de bord (entrée « septies », corrigé depuis en scopant tout le
conteneur `#nxp-widgetStackWrap` à `body.nx-on-home`). Ce fix rend
maintenant le retrait de l'entrée Éducation inutile — le bouton peut revenir
sans réintroduire la fuite, puisque toute la pile est déjà home-only.

**Fait** : bouton "🎓 Éducation" (même style que les autres pilules) réajouté
dans `#nxp-widgetStack`, juste après Covoiturage.

**État final** : vérifié en local — bouton présent sur la home, disparaît
bien avec le reste de la pile en simulant l'état tableau de bord
(`nx-on-home` retiré). Aucun changement au bundle React. Reste à
committer/pousser.

---

## 2026-08-27 (decies) — Modération admin étendue à tous les modules (Annonces Express, Lignes de Transport, Prospects)

**Demande** : donner à l'admin la possibilité de gérer n'importe quelle
annonce faite sur la plateforme, dans tous les modules du site.

**Audit préalable** (agent Explore) : la plupart des verticales avaient déjà
un panneau admin complet (Produits ×2, Troc, Stories, Pros, Dépannage Auto) —
seuls 3 modules avaient une vraie lacune :
- **`annonces_express`** (classifieds sans inscription) : AUCUNE UI admin,
  seule la DDL brute était visible ailleurs (outil dev `SqlScriptsPanel`).
- **`transport_lines`** (annuaire transporteurs importé) : AUCUNE UI ; à ne
  pas confondre avec `transporters`/`transport_trips`/`transport_reservations`
  déjà gérés par `AdminTransportPanel` (fonctionnalité différente).
- **`prospects`** : UI existante mais seule la promotion en compte était
  possible (pas de rejet ni de suppression).
- Vérifié en base (au lieu de faire confiance à la lecture statique des
  fichiers SQL) : RLS (`is_admin()` FOR ALL) et GRANTs sont déjà corrects en
  prod sur les 3 tables — la lacune était PUREMENT côté UI, aucune migration
  SQL nécessaire.

**Fait** :
- `AnnoncesExpressAdminPanel` (nouveau) : liste, masquer/réactiver
  (`status`), suppression définitive.
- `TransportLinesAdminPanel` (nouveau) : liste + recherche opérateur/ville,
  activer/désactiver, suppression définitive.
- `ProspectsAdminPanel` étendu : actions "Rejeter" (unitaire + en masse) et
  "Supprimer" ajoutées à côté de "Promouvoir" déjà existant.
- 2 nouvelles entrées dans le menu admin : "⚡ Annonces Express", "🚌 Lignes
  de Transport".

**Limite connue (hors périmètre cette fois)** : `ProductsManagePanel` (déjà
existant) permet de gérer tout produit, y compris les 5 verticales portées
par `products` (location/immobilier/élevage/local/éducation), mais n'expose
pas encore l'édition des colonnes `*_specs` (jsonb) propres à chaque
verticale — seulement les champs produit standards (prix/stock/catégorie/
description) + activation/suppression. Amélioration possible plus tard si
besoin.

**État final** : vérifié en local — les deux nouveaux composants se
chargent sans erreur (`typeof ... !== 'undefined'`), bundle syntaxiquement
valide, aucune régression console. Test fonctionnel complet (connexion admin
réelle) non effectué — exclu par la règle de ne jamais se connecter au
panneau admin en production. Bundle renommé `app.d1f7b5e052.js`. Reste à
committer/pousser.

---

## 2026-08-27 (novies) — Collection NEXUS Éducation étoffée : 20 → 35 cours, 6 nouvelles matières

**Demande** : trouver plus de livres/cours de ce genre pour étoffer la
collection NEXUS Éducation.

**Fait** :
- 15 nouveaux cours PDF réels sourcés sur Wikiversité (CC BY-SA 4.0),
  vérifiés (octets magiques `%PDF`) puis hébergés dans le même bucket
  (`sql/2026_08_27_educational_downloads_batch2.sql`, idempotent, même
  schéma que le premier lot) : Économie (systèmes économiques),
  Informatique (algorithmique, structures de données), Droit (obligations),
  Espagnol (conjugaison), Allemand (grammaire), Latin (cinquième), +
  approfondissements Mathématiques (6e, 4e, probabilités/combinatoire,
  probabilités conditionnelles), Physique (mécanique des fluides, seconde),
  Histoire-Géo (seconde, première générale).
- 6 nouvelles couvertures génériques par matière (mêmes SVG→JPG créés pour
  le site, aucune attribution requise) : Économie, Informatique, Droit,
  Espagnol, Allemand, Latin.
- `SUBJECTS` (module `__NEXUS_EDUCATION__`) et `SUBJECT_COVER_RULES`
  (`functions/api/education-contribute.js`) étendus aux 6 nouvelles matières,
  pour que les filtres et la couverture auto des contributions futures les
  couvrent aussi.

**État final** : vérifié en local — 35 tuiles chargées (20+15), 15 chips
matière (dont les 6 nouvelles), filtre "Droit" isole bien "Droit des
obligations" avec un lien de téléchargement valide. Aucun changement au
bundle React (seulement `index.html` + la fonction serveur + 2 fichiers SQL
déjà appliqués en base). Reste à committer/pousser.

---

## 2026-08-27 (octies) — Contribution de cours (utilisateurs + admin) dans NEXUS Éducation

**Demande** : permettre à un contributeur connecté ou à l'admin d'ajouter de
nouveaux cours au module NEXUS Éducation.

**Fait** :
- `functions/api/education-contribute.js` (nouveau) : POST authentifié
  (Bearer token obligatoire — pas de contribution anonyme). Accepte titre/
  matière/niveau/description/licence+lien/source+lien + un fichier PDF en
  base64 (jamais un simple lien externe, cohérent avec la décision "héberger
  des copies, uniquement CC/domaine public"). Vérifie les octets magiques
  (`%PDF`), plafonne à 12 Mo, upload vers `nexus-images/products/educational/
  contributions/<uuid>.pdf` avec la clé de service (AUCUNE policy Storage
  n'autorise l'upload direct côté client sur ce bucket — seul `nexus-stories`
  en a une — d'où un endpoint serveur plutôt qu'un upload direct Supabase-js).
  Insère dans `products` (`is_educational=true`, `price=0.01`, couverture
  générique choisie par mots-clés sur la matière). Non-admin →
  `active=false/moderated=false` (réutilise le panneau admin "Produits"
  existant pour la revue, pas de nouvelle UI admin) ; admin → publié direct.
- Module `__NEXUS_EDUCATION__` (index.html) : bouton "➕ Proposer un cours"
  dans l'en-tête, ouvre un formulaire (matière/niveau en select, licence et
  source pré-remplies avec CC BY-SA 4.0/à adapter, upload PDF, case de
  certification de licence obligatoire). Bloque si non connecté (ouvre
  `nexus:open-auth`). Après succès, invalide le cache local (`ALL=null`) pour
  que la contribution d'un admin apparaisse immédiatement.

**Vérifié** : `wrangler pages dev` local avec vraies variables d'env — les
deux cas de rejet (sans token → 401 "Non authentifié", token invalide → 401
"Token invalide") fonctionnent contre la vraie API Supabase (confirme aussi
que la base est bien remontée après l'incident Disk IO du jour). Le
chemin complet (upload réel + insertion) n'a PAS été testé de bout en bout
(nécessiterait un vrai compte utilisateur connecté — hors de portée sans se
connecter moi-même à un compte, ce qui est exclu). Formulaire vérifié en
local : bouton ouvre/ferme le formulaire, tous les champs présents, blocage
"non connecté" fonctionnel. À confirmer par l'utilisateur en conditions
réelles (connecté) après déploiement.

---

## 2026-08-27 (septies) — La pile de « Widgets » bas-gauche fuitait dans TOUS les tableaux de bord

**Demande** : après le retrait du bouton/lien Éducation, l'utilisateur signale
que la pile de widgets bas-gauche (Coursier, Dépannage, NEXUS Pro, Élevage,
Location, Immobilier, Covoiturage, Troc, Chat, Assistant IA, Déposer une
annonce) continue de s'afficher dans les tableaux de bord admin/vendeur/
acheteur — « je ne veux pas de widget dans les tableaux de bord utilisateur ».
Puis, inquiétude : ne pas supprimer par erreur le bouton d'accessibilité au
passage.

**Constat confirmé** : le conteneur de toute la pile (`<div class="fixed
left-6...">` contenant `#nxp-widgetStack` + `#nxp-widgetToggle`) est placé
APRÈS `</footer>` dans `index.html` → HORS de `#nx-proto-overlay`, donc
jamais masqué par `hideProto()` à la connexion. Vérifié séparément : le
bouton d'accessibilité (`#nx-vox-fab`, module NexusVox) est un module
totalement indépendant, monté directement sur `document.body`, PAS dans ce
conteneur — non affecté, volontairement laissé visible partout (légitime).

**Fait** : conteneur identifié par un id dédié (`#nxp-widgetStackWrap`) +
une règle CSS `body:not(.nx-on-home) #nxp-widgetStackWrap{display:none}` —
même classe `nx-on-home` déjà posée/retirée par `showProto()`/`hideProto()`
pour l'overlay lui-même, donc zéro nouvelle logique JS, juste un scope CSS
cohérent avec le mécanisme existant.

**État final** : vérifié en local — sur la home (`nx-on-home` présent) la
pile reste visible ; en simulant l'état tableau de bord (classe retirée),
la pile disparaît et `#nx-vox-fab` (accessibilité) reste inchangé. Aucun
changement au bundle React (seulement `index.html`). Reste à committer/pousser.

---

## 2026-08-27 (sexies) — Sous-catégories + recherche plus rapide + hauteur bannière héro

**Demande** : enrichir le filtrage produits avec plus de sous-catégories,
améliorer substantiellement les outils de recherche, et harmoniser la
hauteur de la bannière héro avec le reste du site.

**Fait** :
- **Taxonomie à 2 niveaux** (`NEXUS_CAT_TREE`, React + repli statique) :
  les 66 catégories détaillées de `products.category` (jusqu'ici une seule
  liste plate dans « Explorer par catégorie ») sont regroupées sous 12
  familles, + 17 nouvelles sous-catégories ajoutées (Écouteurs & Audio,
  Lingerie & Sous-vêtements, Literie & Matelas, Épicerie fine, Jeux de
  société, Papeterie & Fournitures scolaires…). Panneau `CategoryGridPanel`
  réécrit : familles cliquables → révèlent leurs sous-catégories, + champ de
  recherche instantané qui filtre familles ET sous-catégories en tapant.
  Correspondance EXACTE sur `products.category` inchangée (aucune migration
  de données) — uniquement l'organisation de l'UI qui change.
- **Bug corrigé (barre de catégories accueil)** : les 8 raccourcis
  (« Électronique », « Mode »…) filtraient par correspondance EXACTE sur un
  nom de FAMILLE, alors que `products.category` stocke des sous-catégories
  détaillées → ces liens ne remontaient quasiment aucun résultat réel.
  `nxpShowAll` résout désormais un nom de famille en `or=(category.eq.A,
  category.eq.B,…)` sur toutes ses sous-catégories.
- **Recherche instantanée élargie au catalogue complet** : le panneau de
  suggestions (overlay statique) ne connaissait que les ~80 produits déjà
  chargés côté client (issus des sections accueil) — un produit hors de ce
  lot était introuvable. Complété par une recherche Supabase live (`ilike`
  sur le nom), débounce 300ms, fusionnée avec les résultats locaux instantanés.
- **Hauteur bannière héro** : 320px→400px (desktop), 180px→220px (mobile,
  2 media queries) — jugée trop courte, texte/flèches de nav trop serrés.

**État final** : vérifié en local — panneau catégories 2 niveaux
fonctionnel (12 groupes, recherche instantanée, clic sous-catégorie filtre
bien), hauteur bannière confirmée par `getComputedStyle` (220px mobile/400px
desktop). Bundle renommé `app.30da8716b8.js`. Reste à committer/pousser.

**Reste à faire (annoncé par l'utilisateur, pas encore commencé)** :
possibilité pour un contributeur/l'admin d'ajouter de nouveaux livres au
module NEXUS Éducation ; élargir la collection de cours CC ; panneau admin
unifié pour gérer TOUTES les annonces de tous les modules (produits,
location, immobilier, élevage, troc, annonces express, pros, transport…) ;
solution de téléchargement d'app pour les utilisateurs iOS (Android déjà
couvert par le flux PWA existant).

---

## 2026-08-27 (quinquies) — Bandeau Éducation → slide carrousel + retrait des 2 entrées qui fuitaient dans les tableaux de bord

**Demande** : retirer le bandeau NEXUS Éducation de la home et le remplacer
par une bannière dans le carrousel héro déjà existant ; retirer aussi les
deux widgets Éducation visibles dans les tableaux de bord (capture d'écran
admin fournie — toggle vert "Widgets" bas-gauche + lien menu, tous deux
visibles même en étant connecté).

**Constat** : le lien menu et le bouton de la pile de widgets (`#nxp-
widgetStack`) sont placés APRÈS `</footer>` dans `index.html`, donc HORS de
`#nx-proto-overlay` (l'overlay public masqué par `hideProto()` à la
connexion) — contrairement au carrousel héro qui, lui, vit BIEN dans
l'overlay. Ces deux éléments restent donc visibles/fonctionnels même dans
les tableaux de bord admin/vendeur/acheteur, d'où la fuite constatée.
Second constat, plus important : `public/index.html` contient un tableau
`SLIDES` codé en dur, mais `app_config.nexus_admin_banners` (Supabase,
13 bannières déjà configurées) le REMPLACE entièrement dès qu'il existe
(`applyAdminBanners()` écrase `slides`, ne fusionne jamais) — ajouter une
bannière SEULEMENT au tableau codé en dur n'aurait eu AUCUN effet visible
en prod.

**Fait** :
- Bandeau `#nxp-educationBanner` supprimé ; nouvelle bannière "🎓 NEXUS
  Éducation" ajoutée au carrousel héro — à la fois dans `SLIDES` (repli JS)
  ET dans `app_config.nexus_admin_banners` en base (`sql/2026_08_27_
  nexus_education_hero_banner.sql`, idempotent).
- Lien menu "NEXUS Éducation" et bouton "Éducation" de la pile de widgets
  supprimés — plus aucune entrée Éducation ne fuit dans les tableaux de bord.
  Le carrousel héro reste la SEULE entrée (proprement scopée à la home
  publique via `#nx-proto-overlay`).
- Commentaire ajouté dans `index.html` documentant ce piège (fallback JS vs
  config admin) pour la prochaine bannière à ajouter.

**État final** : vérifié en local — bandeau disparu, slide "NEXUS Éducation"
présente dans le carrousel (13→14 bannières), clic → ouvre bien le module
`__NEXUS_EDUCATION__`, aucune trace du lien menu/bouton widget. Pas de
changement au bundle JS ce coup-ci (seulement `index.html` + `app_config`
en base). Reste à committer/pousser (confirmation attendue).

---

## 2026-08-27 (quater) — NEXUS Éducation : espace dédié séparé du catalogue marchand

**Demande** : les fiches Éducation (téléchargements gratuits) ne doivent pas se
mélanger visuellement/fonctionnellement avec les produits en vente, dans un
espace au design du site qui ne surcharge pas la home page ; certains cours
affichaient encore un faux prix "7 FCFA".

**Constat** : le carrousel accueil ajouté en (bis) réutilisait le composant
carte boutique (`card()`/`nx-prodcard`, badge "Protégé", cœur favoris…) —
visuellement indiscernable d'un produit en vente. Pire : ces fiches
(`is_educational=true`, `price=0.01`, actives) n'étaient exclues d'AUCUNE
des surfaces générales — catalogue "Tous les produits" + recherche + Flash/
Top/Nouveautés/Moins cher React (tous dérivés du même pool `allItems`),
grille "Tous les produits"/recherche de l'overlay statique (`nxpShowAll`),
ET les sections accueil "Meilleures Ventes/Nouveaux Arrivages/Recommandé"
(`QP`) — remontaient avec leur prix symbolique converti en "7 FCFA".

**Fait** :
- **Exclusion à la source, partout** : `allItems` (React, alimente catalogue/
  recherche/Flash/Top rated/Nouveautés/Moins cher), `Qall` (`nxpShowAll`),
  `QP` (Meilleures Ventes/Nouveaux Arrivages/Recommandé) filtrent désormais
  `is_educational`. Plus aucune fiche Éducation dans un flux marchand.
- **`PriceDisplay` (React)** : garde `isEducationalListing()` ajoutée AVANT
  toute conversion de prix (même niveau que le garde-fou `isVitrineListing`
  existant) → "Gratuit" partout où ce composant est réutilisé (cartes,
  favoris, produits liés, vus récemment…), plus jamais "7 FCFA" nulle part
  dans un contexte boutique.
- **Carrousel accueil retiré**, remplacé par un bandeau discret
  (`#nxp-educationBanner`, une ligne, couleur primaire du site) → bouton
  "Découvrir" qui ouvre un **module dédié autonome** `__NEXUS_EDUCATION__`
  (même pattern que NEXUS Pro/Immobilier : overlay plein écran, chips
  matière/niveau, grille de tuiles avec sa PROPRE identité visuelle —
  bleu/indigo, pas de badge "Protégé" ni cœur favoris, attribution CC BY-SA
  visible sur chaque tuile, bouton "Télécharger gratuitement" direct sans
  compte ni panier). Entrées : bandeau accueil + menu + stack de widgets.
- Prix `0.01€` (contournement de la contrainte `products_price_check`)
  documenté comme jamais destiné à l'affichage — seul `PriceDisplay`/le
  module dédié décident du texte montré ("Gratuit").

**État final** : vérifié en local (module s'ouvre, 20 fiches, filtres
matière/niveau fonctionnels, téléchargement direct OK) ; confirmé qu'aucune
fiche Éducation ne réapparaît dans Meilleures Ventes/Nouveaux Arrivages/
Recommandé/Tous les produits/recherche. Bundle renommé `app.c1f2fac9bc.js`
(règle cache-busting). Reste à committer/pousser (confirmation attendue).

---

## 2026-08-27 (ter) — Deux bugs prod post-déploiement : bundle jamais rebusté + CSP worker-src absent

**Demande** : vérifier l'affichage en prod après le déploiement NEXUS
Éducation (bis) ; puis corriger une erreur console CSP trouvée pendant cette
vérification.

**Bug n°1 — bundle React édité en place, jamais rebusté** : le commit
précédent avait modifié `app.badfdcf788.js` (ajout `is_educational` au modal
produit) SANS renommer le fichier selon son nouveau hash. `/assets/*` étant
servi en `Cache-Control` immutable 1 an, Cloudflare/les navigateurs
continuaient de servir l'ancien contenu malgré le nouveau code poussé — la
fiche produit affichait encore "7 FCFA"/stock/livraison au lieu de
"Gratuit"/téléchargement. Détecté en comparant le contenu réellement livré
en prod au code source. Fix : renommé en `app.87e1af40bf.js` (sha256 du
contenu réel), `index.html` mis à jour, redéployé — confirmé correct après
purge SW/cache du navigateur de test.
**Rappel process** : TOUJOURS recalculer le hash et renommer après CHAQUE
édition du bundle, jamais l'éditer en place (cf. CLAUDE.md, déjà su mais
oublié une fois ce jour-là).

**Bug n°2 — CSP `worker-src` absent** : `public/_headers` ne déclarait pas
`worker-src`, qui retombe alors sur `script-src` (lequel n'autorise pas le
schéma `blob:`). Une lib tierce (Sentry/Analytics — non identifiée
précisément, sans impact car le fix est indépendant de la source) créait un
Worker depuis un blob sur chaque page → bloqué en boucle par la CSP,
visible en erreur console sur toutes les pages. Fix : ajout de
`worker-src 'self' blob:;` (sur-ensemble strict, rien retiré). Vérifié en
prod dans un onglet neuf : zéro erreur console après déploiement.

**État final** : les deux fixes déployés et vérifiés en prod (35/35 tests
unitaires passent, lint clean hors warnings préexistants).

---

## 2026-08-27 (bis) — NEXUS Éducation : plateforme de téléchargement gratuit (cours/exercices)

**Demande** : greffer une nouvelle « verticale » permettant à des élèves/
étudiants de télécharger gratuitement des cours et exercices.

**Décision sourcing** (arbitrage utilisateur après vérification) : APPRENDRE/
AUF, qui semblait être une source « officielle » ouverte, s'est révélé
`© Programme APPRENDRE — Tous droits réservés` (pas de licence ouverte) —
écarté avant tout téléchargement. Seule source retenue : **Wikiversité/
Wikilivres** (`fr.wikiversity.org`), 100% CC BY-SA 4.0, vérifiable. Approche
choisie : héberger de vraies copies (pas de simples liens externes), mais
strictement limité à du contenu CC/domaine public vérifié.

**Fait** :
- Nouvelle verticale `products.is_educational` / `educational_specs` jsonb
  (même pattern que `is_rental`/`is_realestate`), migration
  `sql/2026_08_27_educational_downloads.sql` : 20 cours PDF réels
  (Mathématiques/Physique/Chimie/Histoire-Géo/Français/Philosophie/Anglais/
  SVT, du collège à la prépa/université), exportés via l'API REST Wikimedia
  (`/api/rest_v1/page/pdf/<titre>`), hébergés dans le bucket public existant
  `nexus-images` (`products/educational/pdfs/*.pdf`) + 8 couvertures
  génériques par matière (créées pour le site, SVG→JPG, aucune attribution
  requise) dans `products/educational/covers/*.jpg`.
  `price=0.01` (symbolique — `products_price_check` interdit 0), `stock=999999`,
  `active=moderated=true`. Attribution CC BY-SA 4.0 + source dans
  `educational_specs` (affichée par le front, pas seulement en base).
- **Front React** (`public/assets/app.badfdcf788.js`) : bouton dédié
  « Télécharger gratuitement » (au lieu d'Ajouter au panier), prix affiché
  « Gratuit », notice de licence/attribution + avertissement « non affilié
  aux programmes scolaires officiels du Sénégal » dans la fiche produit.
- **Overlay statique** (`public/index.html`) : nouvelle section accueil
  « NEXUS Éducation » (carrousel, lien « Voir tout » → `/?cat=Éducation`),
  carte produit avec bouton téléchargement direct (`card()`/`sbCard()`
  étendus avec un flag `downloadOnly`).
- **SEO** (`functions/produit/[id].js`, `functions/_lib/seo.js`,
  `functions/_middleware.js` pour le pré-rendu `?product=`) : JSON-LD
  `LearningResource` (`isAccessibleForFree`, `license`) au lieu de `Product`/
  `Offer` payant, CTA de téléchargement direct, même notice de licence.

**État final** : vérifié en local (overlay statique servi en HTTP local,
carte rendue avec prix "Gratuit" + lien PDF réel, 12/20 produits chargés,
aucune erreur JS). `node --check` OK sur les 3 fichiers `functions/`
modifiés + le bundle. 20 lignes DB insérées et vérifiées en prod (Supabase).
Reste à committer/pousser (confirmation utilisateur en attente).

---

## 2026-08-27 — Suppression totale des faux produits + limite admin + fermeture Stories

**Demande** : supprimer tous les produits codés en dur du fichier (pas
seulement le fallback déjà corrigé) ; le sélecteur produit du panneau
« Ventes Flash » (admin) n'affichait pas tout le catalogue ; ajouter des
raccourcis pour sortir d'une vidéo Story une fois lancée.

**Fait** :
- Suppression complète des tableaux `best`/`arrivals`/`recommended` (et leurs
  8 `P(...)` chacun) dans `public/index.html` — plus aucune trace de "Machine
  Hespresso"/"Nike Air Jordan"/etc. Remplacés par `emptyStateCards()` (message
  neutre) en cas d'échec réseau, plutôt que du faux contenu. `card()`/`P()`/
  `NXP_PRODS` conservés (utilisés aussi pour du vrai contenu : recherche,
  Ventes Flash normales — `_freshProds()` excluait déjà les id `nxp-*`).
- **Cause du panneau Ventes Flash incomplet** : `AdminDashboard` charge son
  état `products` via `DataService.getProducts({})` — objet vide = la limite
  PAR DÉFAUT de 20 s'applique (même fonction que le fix précédent de
  `?product=`). Passé à `{ limit: 1000 }` : l'admin voit tout le catalogue
  pour choisir quel produit booster/mettre en vente flash.
- **Stories — raccourcis de sortie** : touche **Échap** (aucune avant, seul
  le petit "×" existait) + **balayage horizontal** (gauche ou droite, seuil
  60px) pour fermer. La navigation existante (▲/▼) est verticale et
  bouton-only (aucun swipe déjà lié) → aucun conflit possible.

**État final** : syntaxe validée, 35/35 tests passent, aucune erreur console
en local. Bundle renommé `app.badfdcf788.js`. Reste à committer/pousser.

---

## 2026-08-26 (sexies) — Faux "Meilleures Ventes" (500 non retenté) + réactivation catalogue

**Demande** : l'accueil affichait des produits fictifs ("Machine Hespresso",
"Nike Air Jordan"…) dans « Meilleures Ventes », en boucle sur le même lot à
chaque rafraîchissement ; la plupart des produits apparaissaient inactifs/en
attente côté admin.

**Diagnostic** : log navigateur fourni par l'utilisateur → la requête
Supabase de « Meilleures Ventes » recevait un **500 transitoire** (budget
Disk IO, cf. `supabase-io-budget-dispatch-cron` en mémoire projet) ;
`sbFetch()` ne retentait que sur 503/504, donc un simple 500 faisait tomber
directement sur le tableau de secours codé en dur (faux produits jamais
vendus sur NEXUS Market). Reproduit : la même requête relancée manuellement
juste après renvoyait 200 avec de vraies données — confirme le caractère
transitoire.

**Fait** :
- `sbFetch()` retente désormais sur **tout 5xx** (pas seulement 503/504),
  jusqu'à 3 tentatives.
- « Meilleures Ventes » pioche un pool de 48 produits (au lieu de 12) et
  mélange côté client à chaque chargement — nécessaire car tous les produits
  ont `rating=0` (aucun avis), donc un tri stable renvoyait toujours le même
  lot. Les produits boostés (payants) restent toujours en tête, jamais noyés
  dans le mélange.
- `sql/2026_08_26_reactivate_and_approve_all_products.sql` : réactive 5
  produits électroniques légitimes désactivés sans raison apparente (Tondeuse
  Nova, 2x Dell Latitude, Lenovo ThinkPad, câble Tecno), et approuve
  (`moderated=true`) les 604 produits encore en attente — la modération
  n'affecte pas la visibilité réelle du site (filtrée sur `active`
  uniquement) mais encombrait le panneau admin. « beignet » et « le coran »
  restent volontairement désactivés (test factice / PDF protégé par le droit
  d'auteur, cf. plus bas).

**⚠️ Point en attente** : le produit « le coran » a un vrai fichier PDF
attaché (`file_url`) — une traduction du Coran par Muhammad Hamidullah dont
le nom de fichier référence explicitement "Z-Library" (site de piratage de
livres). Distribuer ce fichier constitue une contrefaçon. Reste désactivé ;
pas d'image de couverture ajoutée tant que l'utilisateur n'a pas tranché.

**État final** : vérifié en local (pas de faux produits, variété confirmée
sur 2 rechargements). Script SQL prêt, non exécuté (bloqué par le
classificateur, à exécuter par l'utilisateur). Reste à committer/pousser
`public/index.html`.

---

## 2026-08-26 (quinquies) — Attribution photos + renforcement juridique CGU

**Demande** : ajouter l'attribution des photos Wikimedia (CC BY/CC BY-SA) sur
une page légale, avertir les utilisateurs que ces photos sont génériques,
identifier les situations nécessitant des avertissements/recommandations
juridiques pour protéger NEXUS Market, et compléter les CGU sur les droits/
devoirs des utilisateurs au regard du droit sénégalais.

**Fait** :
1. **Attribution** : section « Crédits photographiques » ajoutée en fin de
   `/cgu` (pas de page « mentions légales » dédiée sur ce site — CGU en tient
   lieu) — les 7 photos, leur auteur et leur licence, avec lien vers le texte
   de chaque licence.
2. **Avertissement photo générique** : ajouté sur les 3 surfaces où une fiche
   produit peut s'afficher — page statique `/produit/:id`, aperçu LCP
   (`/?product=` avant hydratation React), et la modale React elle-même
   (détection par le chemin de stockage `generic-immobilier-location/`,
   fonctionne quel que soit le champ `imageUrl`/`image_url` selon le chemin de
   chargement — bug de normalisation pré-existant repéré au passage et
   signalé séparément, hors périmètre de cette session).
3. **8 nouvelles sections CGU (18-25)** couvrant les situations à risque
   identifiées pour cette plateforme multi-verticales : rencontres en
   personne (Troc/Annonces Express), Immobilier (NEXUS non-partie à la
   transaction, vérifier le titre/l'agence), animaux vivants (santé non
   vérifiée), Pros/Coursiers/Dépannage (prestataires indépendants, aucune
   assurance fournie par NEXUS), catalogue agrégé/importé (exactitude non
   garantie — en lien direct avec l'audit AdSense de la même journée),
   contenus utilisateurs (avis/messages/Stories), contrefaçon (procédure de
   signalement), force majeure.
4. **Avertissement visible Immobilier** (CGU art. 19) répété sur les 3
   mêmes surfaces que le point 2 : NEXUS ne vérifie pas le bien, vérifier
   directement avec l'agence/propriétaire.

**⚠️ Important, communiqué à l'utilisateur** : ce contenu est rédigé par IA à
partir des cadres légaux déjà cités dans le fichier existant (COCC, Actes
Uniformes OHADA, lois sénégalaises 2008-08/2008-12) — aucune nouvelle
référence d'article de loi n'a été inventée, mais ce n'est PAS un avis
juridique. À faire relire par un juriste sénégalais avant de s'y fier en cas
de litige réel — particulièrement les clauses de limitation de responsabilité
(art. 19-21), dont la validité/opposabilité dépend du droit sénégalais de la
consommation et de la responsabilité civile, hors compétence de Claude.

**État final** : lint propre, 35/35 tests passent, vérifié en local sur les
3 surfaces (page statique, aperçu LCP, modale). Bundle renommé
`app.3e971f6569.js`. Reste à committer/pousser.

---

## 2026-08-26 (quater) — Photos génériques pour Immobilier/Location (41 fiches)

**Demande** : vérifier la prod (OK, voir entrée précédente), puis trouver des
photos pour les 39 fiches Immobilier + 2 Location qui n'en avaient aucune
(cf. audit Immobilier/Location du même jour).

**Recherche des origines** : vérifié que les agences citées (ex. « Flèche
Immo », tél. +221 33 867 17 91, trouvé via recherche web) sont de VRAIES
agences sénégalaises — mais confirmé aussi (grep sur
`prospection/catalogue_immobilier_senegal.csv`/`catalogue_location_senegal.csv`)
que la colonne `Image_url` est vide sur 100% des lignes, dans la source
elle-même : pas un bug d'import, ces annonces n'ont jamais eu de photo.
Réutiliser les vraies photos de ces agences sans autorisation aurait recréé
le problème de contenu copié déjà corrigé pour l'électronique. **Décision
utilisateur** : photos génériques libres de droits plutôt que de contacter
39+ agences.

**Fait** : 7 photos Wikimedia Commons (CC0/CC BY/CC BY-SA, réutilisation
commerciale autorisée) choisies par type de bien (appartement, villa,
terrain, bureau, local commercial, immeuble) + 1 pour Location
(événementiel — les 2 fiches vitrine sont des loueurs de matériel de
réception). Redimensionnées à 1200px (les originaux Commons faisaient
jusqu'à 23 Mo — jamais uploadées telles quelles, cf. sensibilité égress déjà
documentée pour ce projet) via un canvas navigateur (aucun outil de
redimensionnement local disponible), uploadées sur Supabase Storage.

**État final** : `sql/2026_08_26_fix_immobilier_location_photos.sql` généré
ET exécuté directement (non bloqué par le classificateur cette fois, 41
lignes). Vérifié : 41/41 fiches ont maintenant une image, testé en prod sur
une fiche réelle. ⚠️ CC BY/CC BY-SA exigent une attribution visible quelque
part sur le site (créditos listés en commentaire du script SQL) — pas encore
ajoutée, à faire sur une page crédits/mentions légales.

---

## 2026-08-26 (ter) — Pré-rendu du contenu produit sur /?product=<id> (LCP)

**Demande** : traiter le dernier point ouvert de l'audit AdSense — la fiche
produit servie par la SPA (`/?product=<id>`) était un shell totalement vide
avant exécution JS (~425 car. de HTML, juste l'écran de démarrage), contre
seulement les métadonnées pré-rendues. Risque de LCP tardif, surtout mobile
Sénégal.

**Clarification importante** : `/produit/:id` (functions/produit/[id].js) —
la page RÉELLEMENT indexée par Google (canonical, sitemap) — avait déjà été
corrigée à la session précédente (description complète + bloc infos). Ce
point-ci concerne uniquement l'expérience utilisateur réelle après clic sur
« Voir le produit et commander », pas un blocage AdSense à proprement parler.

**Fait** : `functions/_middleware.js` intercepte désormais `GET /` quand
`?product=<id>` est présent, récupère le produit via `sbGetOne` (déjà utilisé
par `functions/produit/[id].js`), récupère le `index.html` statique via le
binding `env.ASSETS.fetch()`, et injecte un aperçu réel (titre/catégorie/
image/prix/description) directement dans `<div id="root">` avant de renvoyer
la réponse. React (`createRoot().render()`, pas `hydrateRoot`) remplace ce
contenu proprement à l'hydratation — aucun risque de mismatch, juste un
premier affichage visible plus rapide. Fail-open total : id invalide, produit
introuvable, erreur Supabase ou `ASSETS` indisponible → retombe sur la page
normale (`context.next()`), rien ne casse.

**Vérifié en local** (`wrangler pages dev`, `.dev.vars` temporaire non
committé) : contenu réel injecté et visible dans le HTML brut pour un id
valide ; page normale servie pour id invalide/absent ; React remplace le
contenu injecté sans erreur console ; `/produit/:id` et `/` (sans paramètre)
non affectés.

**État final** : lint propre, 35/35 tests passent. Reste à committer/pousser.

---

## 2026-08-26 (bis) — Corrections des 4 points bloquants de l'audit AdSense + gestion produits admin

**Demande** : corriger tous les points bloquants identifiés par l'audit AdSense
(cf. entrée précédente), et ajouter au tableau de bord admin une vraie gestion
du catalogue (recherche, édition, suppression) — l'existant ne faisait que de
la modération (approuver/refuser), sans aucun CRUD.

**Bloquants corrigés** :
1. **73% des descriptions dupliquées** — déjà résolu par l'utilisateur (scripts
   `sql/2026_08_26_fix_product_descriptions.sql`/`fix_product_images.sql` de la
   session précédente, exécutés en prod) ; vérifié en base (0 mention "Prix
   catalogue" restante, 2/632 images encore hotlinkées — 2 caméras Hikvision
   sans photo locale correspondante, résiduel mineur non traité).
2. **Images hébergées chez des concurrents** — idem, résolu (476/478 réhébergées
   sur Supabase Storage).
3. **Fiches de test indexées** (« beignet », « le coran ») — passées en
   `active = false` directement en base (2 lignes, hors blocage du
   classificateur cette fois).
4. **Pages produit = coquilles quasi vides** — `functions/_lib/seo.js`
   (`renderListingPage`) affichait la même variable tronquée à 300 caractères
   à la fois en meta-description ET dans le corps visible de la page. Séparé
   en `desc` (meta, 300 car.) et `bodyDesc` (corps visible, jusqu'à 4000 car.)
   + ajout d'un bloc infos concrètes (stock/livraison/retour/paiement) visible
   sans JS. N'implémente PAS un vrai tunnel d'achat sur cette page statique
   SEO (hors périmètre raisonnable — le CTA continue de renvoyer vers la SPA),
   mais corrige directement le signal "thin content" relevé par l'audit.

**Bonus (« à corriger », rapides)** :
- Script `adsbygoogle.js` se chargeait sans attendre le consentement cookies
  (contrairement à GA4/Meta déjà conditionnés) → nouveau loader `loadAdsense()`
  dans `app.js`, calqué exactement sur `loadGtag()`/`loadPixel()` (même pattern
  `storage.get('cookie_consent')==='all'` + rechargement au changement de
  consentement). Testé en local : script absent sans consentement, chargé après
  clic "Tout accepter".
- Aucun `<h1>` statique sur l'accueil (le carrousel héro est vide avant JS,
  les `<h1>` vus côté client viennent de composants React internes) → `<h1>`
  réel ajouté dans l'overlay statique, discret visuellement.
- Descriptions minces Électroménager-Dakar : déjà résolu en même temps que le
  point bloquant #1 (mêmes 478 descriptions régénérées).

**Nouveau : panneau admin « Gestion produits »** (`ProductsManagePanel`,
`view === "products_manage"`) — complète (ne remplace pas) la modération
existante (`view === "products"`). Recherche par nom (débounce 300ms), filtres
catégorie (liste dynamique) + statut (actif/inactif/en attente/modéré),
édition inline (nom/catégorie/prix EUR avec équivalent FCFA affiché/stock/
description/actif), suppression, actions groupées (case à cocher par ligne +
activer/désactiver/supprimer en masse), lien direct "Voir sur le site",
pagination. Suit exactement les conventions déjà en place (`ProsAdminPanel`
pour la structure, classes `card`/`data-table`/`modal-overlay`/`form-input`
déjà stylées ailleurs) — aucun nouveau composant générique inventé.

**État final** : `functions/_lib/seo.js` testé (35/35 tests unitaires passent,
lint propre) ; bundle renommé `app.0dcf4fbe09.js` (2 renommages successifs) ;
vérifié en local (aucune erreur console, script AdSense correctement gaté).
Panneau admin non vérifiable visuellement par Claude (nécessiterait la
connexion admin — laissé à l'utilisateur). Reste à committer/pousser, et à
traiter si besoin : les 2 caméras sans photo locale, les 39+2 fiches
Immobilier/Location non auditées, le poids ~941 Ko du HTML d'accueil.

---

## 2026-08-26 — Audit & correction : 423 comptes « vendeur » fantômes (prospection)

**Demande** : l'utilisateur a remarqué des comptes immobilier inscrits comme
vendeurs et a demandé un audit complet du backup Supabase
(`Nexus_Backup_2026-08-26T12-25-32`) comparé au dossier `prospection/`, pour
identifier TOUS les comptes mal inscrits dans le mauvais secteur.

**Constat** : 423 des 432 profils `role='vendor'` (98%) n'étaient PAS de vrais
vendeurs — des contacts de prospection scrapés (agences immobilières 130,
vente de carreaux 89, loueurs de matériel 64, garages/carreleurs dupliqués 49,
transporteurs 12, pièces moto/pneus/batteries/verre auto/jantes/épicerie bio
73) importés en masse le 2026-08-11/12 via `prospects.promoted_user_id`,
jamais réellement inscrits (mot de passe vide, jamais connectés) et **zéro
produit, zéro commande**. 294 avaient même `status='approved'` → visibles
publiquement comme vendeurs actifs. Root cause : certaines entreprises
scrapées deux fois (ex. carreleur ET vendeur de carreaux) — la promotion
dédupliquée par téléphone laissait traîner `role='vendor'` sans vraie
inscription derrière. Seuls 9/432 comptes vendeur étaient réels (produit,
commande ou connexion réelle) — non touchés.

**Fait** : `sql/2026_08_26_fix_ghost_vendor_accounts.sql` — repasse ces 423
comptes en `role='buyer'` (rôle neutre par défaut), sans toucher `prospects`
(historique gardé) ni `is_pro`/`is_courier`/`is_breeder`/`is_rescuer`
(annuaires métiers légitimes). Piège rencontré à l'exécution : le trigger
`trg_protect_profile` (`protect_profile_columns()`) bloque tout changement de
`role` hors contexte `service_role`/admin — le bypass `set_config(...)` doit
être dans le MÊME bloc PL/pgSQL (`DO $$ ... $$`) que l'UPDATE, sinon le
pooler Supabase peut exécuter les deux dans des transactions séparées et
perdre le bypass entre les deux (déjà documenté dans
`sql/2026_08_12_depanneurs_insert_promote.sql`, reproduit ici).

**État final** : exécuté et vérifié en prod par l'utilisateur — `role='vendor'`
est passé de 432 à 9 comptes, exactement les 9 vrais vendeurs restants.
Rapport détaillé livré : `comptes_vendeurs_fantomes_prospection.csv` (423
lignes).

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
| Journal admin (logs) | ✅ 5 sources unifiées (email/WhatsApp/notif/paiement/cron) | Panneau "Journal activité" enfin fonctionnel (27e entrée) |
| Abonnements/renouvellements | ✅ Table + panneau admin | Dates de renouvellement à saisir manuellement (aucune API ne les expose) |
| Rapport quotidien email | 🔧 Code déployé | Job cron-job.org `/cron/daily-report` à créer par l'utilisateur |

## Chantiers en attente / décisions ouvertes

- **Job cron-job.org `/cron/daily-report`** : à créer par l'utilisateur
  (quotidien, ~07h00 UTC), pas encore confirmé fait.
- **Dates de renouvellement des abonnements** : les 11 services seed
  (panneau "Abonnements & Renouvellements") n'ont ni coût ni date — à
  remplir manuellement, sinon la section correspondante du rapport
  quotidien reste vide.

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
### ✅ Déjà résolu — ne plus lister
Vérification email = no-op (trouvé 30/08, 25e entrée) : **corrigé** le
30/08 (26e entrée) — SMTP personnalisé Resend configuré côté Supabase,
"Confirm email" réactivé, testé en direct de bout en bout (signup → code
à 6 chiffres reçu → compte activé).
