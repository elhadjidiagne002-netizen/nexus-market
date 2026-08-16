# Plan promotion NEXUS Market — ce qui reste à faire + idées

*Document de travail — à mettre à jour au fil des campagnes. Complète les 3 kits de carrousels (`carrousels-nexus.html`, `carrousels-lancement.html`, `carrousels-tutoriel.html`).*

---

## 1. Déjà en place (récap)

- **Kit services** (12 carrousels/51 slides) — présentation A→Z de chaque fonctionnalité.
- **Kit lancement** (10 carrousels) — annonce, offre 0% commission, ciblage par audience (acheteurs/vendeurs/livreurs/pros), teaser compte à rebours.
- **Kit tutoriel** (12 carrousels/49 slides) — mode d'emploi avec captures d'écran réelles (accueil, recherche, menu, coursier, pro, panier).
- **SEO** : sitemaps dynamiques, fiches indexables par entité (produit/pro/vendeur/troc/story), 15 guides + 16 articles de blog, liens partageables.
- **Diffusion** : campagne email en masse (admin), campagne WhatsApp en masse (admin), SMS (infra prête, `/api/sms`), notifications push (infra prête).
- **Recrutement livreurs** : 88 coursiers prospectés/importés (Google Maps + promotion en comptes).

---

## 2. Ce qui reste à promouvoir (les trous)

### A. Services encore en maquette (pas de vraie capture)
- **NEXUS Stories** et **NEXUS Troc** — l'automatisation n'a pas réussi à capturer ces modules en action. À refaire **manuellement** (2 min sur ton téléphone : ouvrir le module, capture d'écran, me l'envoyer) pour remplacer les maquettes par du réel.
- **Fiche produit détaillée** (zoom, avis, bouton « Ajouter au panier ») — idem.
- **Écran de paiement** (choix Orange Money/Wave/carte) — jamais capturé, uniquement illustré en maquette.
- **Suivi de livraison en direct** (carte GPS coursier) — visuel fort pour la promo, pas encore capturé.

### B. Cibles pas encore promues spécifiquement
- ✅ **Recrutement vendeurs / pros / agents immobiliers** — 3 carrousels dédiés dans `carrousels-complementaires.html` (deck Recrutement).
- ✅ **Ambassadeurs universitaires** — carrousel dédié ajouté (`carrousels-complementaires.html`), cible directement le persona étudiant.
- **Recrutement livreurs** — les 88 prospectés n'ont pas encore reçu de **message de bienvenue/activation** (mentionné en fin de session précédente, jamais fait).

### C. Types de contenu jamais produits
- **Témoignages / avis clients** — impossible à fabriquer honnêtement ; nécessite de vrais retours (à collecter via le programme fidélité ou une relance post-achat).
- ✅ **FAQ / levée d'objections** — carrousel Confiance, 6 questions traitées (fiabilité, remboursement, paiement, coût livraison, litige, annulation).
- ✅ **Comparatif** « Vendre sur WhatsApp vs vendre sur NEXUS » — fait (deck Confiance).
- **Contenu vidéo** (Reels/TikTok/Shorts) — tous les kits actuels sont des carrousels statiques ; aucun script vidéo écrit.
- **Flyers physiques** (marché, Louma, université) avec QR code — rien produit pour le terrain.

### D. Moments/calendrier pas exploités
- ✅ **Saisonnier** — décks dédiés faits pour Tabaski, Korité, rentrée scolaire, Saint-Valentin, fêtes de fin d'année, 4 avril (indépendance).
- **Hebdomadaire** : la Louma du vendredi a un slide, mais pas de **rituel de contenu récurrent** (ex. poster chaque jeudi soir « Demain, Louma »).
- **Après-lancement** : pas de plan pour les semaines suivant le jour J (le kit lancement s'arrête à l'annonce + l'offre).

---

## 3. Autres idées de promotion (au-delà des carrousels)

### Canaux digitaux
- **Publicités payantes** Meta (Facebook/Instagram) et TikTok Ads, ciblage Dakar + grandes villes, 18-45 ans.
- **Micro-influenceurs sénégalais** (lifestyle, bons plans, tech) — troc de visibilité contre commission ou crédit boutique.
- **Groupes Facebook / WhatsApp locaux** ("Bon coin Dakar", groupes de quartier) — poster avec modération (pas de spam).
- **Partenariat co-marketing** avec Orange Money / Wave (logos, offre croisée) — ils ont un intérêt à pousser leurs propres transactions.
- **Programme de parrainage** poussé activement (pas juste mentionné) : "invite 3 amis, gagne 1000 FCFA" avec un lien de parrainage traçable (déjà `?ref=` dans le code).

### Terrain / physique
- **Stand au Louma / marchés** avec flyers + QR code + inscription vendeur sur place.
- **Ambassadeurs universitaires** (UCAD, etc.) — étudiants relais contre commission/avantages.
- **Autocollants QR code** chez les vendeurs déjà inscrits ("Je vends sur NEXUS Market").

### Exploiter l'infra déjà codée (gain rapide, zéro développement)
- **Séquence email de bienvenue** (déjà un moteur d'envoi en masse) : J0 bienvenue, J3 "as-tu vu nos services ?", J7 offre de relance.
- **Campagne WhatsApp de lancement** (déjà construite) vers les prospects/contacts existants.
- **SMS courts** pour les zones à faible data (`/api/sms` déjà rate-limité et prêt).
- **Notifications push** de réactivation pour les comptes inactifs.

### Relations presse / PR
- **Communiqué de lancement** aux médias tech/business sénégalais.
- **Interview fondateur** — storytelling "pourquoi NEXUS Market" (nécessite ton input réel, je ne peux pas l'inventer).

---

## 4. Exemple de calendrier de contenu (hebdomadaire, une fois lancé)

| Jour | Contenu |
|---|---|
| Lundi | Astuce / tuto (1 slide du kit tutoriel) |
| Mercredi | Mise en avant vendeur ou produit populaire |
| Jeudi soir | Teaser "Demain, Louma 🏪" |
| Vendredi | Louma + offres du jour |
| Weekend | Story/Reel produit, contenu léger |

---

## 5. Banque de slogans

### Français — prêts à l'emploi
**Positionnement large / tout-en-un**
- « Tout le Sénégal, au même endroit. » *(déjà utilisé dans les kits)*
- « Un site, mille possibilités. »
- « Achète, vends, échange, déplace-toi — tout est là. »

**Confiance / sécurité**
- « Achète et vends en toute confiance. »
- « Ton argent protégé, jusqu'à la livraison. »
- « La marketplace qui protège tes achats. »

**Fierté locale**
- « 100 % sénégalais, 100 % pour toi. »
- « Fait au Sénégal, pensé pour le Sénégal. »
- « Le marché de chez nous, version digitale. »

**Rapidité / praticité**
- « Ce que tu cherches, à portée de clic. »
- « Commande, on s'occupe du reste. »
- « Rapide comme un coursier NEXUS. »

**Empowerment économique (vendeurs/pros/livreurs)**
- « Vends plus, gagne plus. »
- « Ta boutique, sans les murs. »
- « Chaque Sénégalais peut vendre. Chaque Sénégalais peut trouver. »

**Signature courte (baseline)**
- « NEXUS Market. Simple. Sûr. Sénégalais. »

### Concepts en wolof — ⚠️ à faire valider par un locuteur natif
Je ne suis pas locuteur natif : ce sont des **pistes conceptuelles**, pas des slogans finaux. Fais-les relire/ajuster avant toute utilisation publique (l'idiome et le rythme comptent énormément à l'oral).
- Concept "Acheter, vendre, échanger — sur NEXUS" *(racines : jënd = acheter, jaay = vendre, wecci = échanger)*
- Concept "On te fait confiance" *(idée de yaakar/confiance)*

---

## Prochaine étape suggérée
Dis-moi ce que tu veux attaquer en premier : (a) recapturer Stories/Troc/produit manuellement avec toi, (b) construire la campagne recrutement vendeurs/pros/agents, (c) le carrousel FAQ/confiance, ou (d) lancer une des séquences email/WhatsApp/SMS sur votre base existante.
