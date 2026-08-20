// functions/blog.js → /blog — sommaire du blog (articles pratiques et actualités NEXUS).
// Distinct de /guides : les guides sont des tutoriels de référence (achat, vente,
// paiement) ; le blog couvre des sujets plus ponctuels/saisonniers et les nouveautés
// des différentes verticales (Louma, Location, Coursier…).
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const articles = [
    ['/blog/tabaski-guide-complet-senegal', '🐏 Tabaski au Sénégal : budget, calendrier et préparatifs', 'Planifiez votre Tabaski sereinement : quand acheter, combien prévoir, comment organiser la fête sans stress de dernière minute.'],
    ['/blog/guide-tailles-vetements-senegal', '👕 Guide des tailles : vêtements et chaussures au Sénégal', 'Comprendre les correspondances de tailles (S/M/L, pointures) pour acheter en ligne sans mauvaise surprise.'],
    ['/blog/comment-fixer-prix-revente-objet-occasion', '💰 Comment fixer le juste prix d’un objet d’occasion', 'La méthode pour évaluer et vendre rapidement, que ce soit un meuble, un vêtement ou un appareil.'],
    ['/blog/louma-vendredi-comment-en-profiter', '🏪 Louma du vendredi : comment en profiter au maximum', 'Nos astuces pour repérer les meilleures offres de l’édition hebdomadaire de la marketplace.'],
    ['/blog/bien-annoncer-location-materiel', '🔑 Bien rédiger une annonce de location de matériel', 'Photos, prix, conditions de caution : ce qu’il faut préciser pour louer rapidement et sans litige.'],
    ['/blog/coursier-vs-transporteur-livraison', '🛵 Coursier ou transporteur : quel mode de livraison choisir ?', 'Comparatif pratique selon l’urgence, le volume et la distance de votre envoi.'],
    ['/blog/programme-ambassadeur-nexus-parrainage', '🤝 Programme Ambassadeur NEXUS : gagner en parrainant', 'Comment parrainer vos proches et gagner une commission sur leurs achats.'],
    ['/blog/bien-choisir-voiture-occasion-senegal', '🚗 Bien choisir sa voiture d’occasion au Sénégal', 'Les points de contrôle essentiels avant d’acheter un véhicule d’occasion.'],
    ['/blog/entretenir-vetements-wax-conseils', '🧵 Entretenir ses vêtements en wax : conseils pratiques', 'Lavage, séchage et repassage pour préserver les couleurs de vos tissus wax.'],
    ['/blog/reconnaitre-bijou-or-veritable', '💍 Reconnaître un bijou en or véritable avant l’achat', 'Poinçon, test de l’aimant et autres vérifications de base.'],
    ['/blog/louer-ou-acheter-materiel-btp-chantier', '🏗️ Louer ou acheter du matériel BTP pour un chantier ?', 'Comment choisir entre location et achat selon la durée de vos travaux.'],
    ['/blog/rentree-scolaire-fournitures-manuels-senegal', '📚 Rentrée scolaire : où acheter fournitures et manuels moins cher', 'Manuels d’occasion, anticipation des achats et bons plans de rentrée.'],
    ['/blog/bien-nourrir-loger-animaux-elevage-quotidien', '🐐 Bien nourrir et loger ses animaux d’élevage au quotidien', 'Abri, eau et alimentation adaptée pour la bonne santé de vos animaux.'],
    ['/blog/organiser-evenement-mariage-bapteme-materiel-loue', '🎉 Organiser un mariage ou un baptême avec du matériel loué', 'Bien planifier vos locations pour un événement familial réussi.'],
    ['/blog/garantie-retour-remboursement-marketplace-senegal', '🛡️ Garantie, retour et remboursement : ce qu’il faut savoir', 'Ce que couvre réellement la protection acheteur NEXUS Market.'],
    ['/blog/entretenir-electromenager-saison-chaude-senegal', '❄️ Bien entretenir son électroménager en saison chaude', 'Prolonger la durée de vie de vos appareils et éviter les pannes.'],
    ['/blog/louer-appartement-bureau-local-dakar', '🏢 Louer un appartement, un bureau ou un local à Dakar', 'Location résidentielle et professionnelle : prix, points à vérifier et où chercher.'],
    ['/blog/location-voiture-senegal-agences-prix', '🚙 Location de voiture au Sénégal : agences, prix et conseils', 'Avec ou sans chauffeur : comment bien choisir et ce qu\'il faut vérifier avant de partir.'],
    ['/blog/choisir-ligne-transport-bus-car-ferry-senegal', '🚌 Bus, car ou ferry : bien choisir sa ligne de transport', 'Comparer les compagnies, horaires et prix pour vos trajets interurbains au Sénégal.'],
    ['/blog/louer-jetski-bateau-senegal', '🚤 Louer un jet-ski ou un bateau au Sénégal', 'Sécurité, prix et conseils avant de réserver votre activité nautique.'],
    ['/blog/randonnee-quad-senegal', '🏍️ Randonnée en quad au Sénégal', 'Où et comment réserver une sortie, niveaux de circuits et équipement fourni.'],
    ['/blog/anniversaire-enfant-dakar-materiel', '🎈 Organiser un anniversaire d\'enfant à Dakar', 'Château gonflable, animation, décoration : bien planifier et budgétiser.'],
    ['/blog/louer-food-truck-evenement-senegal', '🚚 Louer un food truck pour un événement', 'Formules, prix et points à vérifier avant de réserver.'],
    ['/blog/trouver-bon-plombier-electricien-dakar', '🔧 Trouver un bon plombier ou électricien à Dakar', 'Les questions à poser avant d\'engager un artisan.'],
    ['/blog/devis-travaux-senegal-comparer-prix', '📋 Devis travaux : comment comparer sans se faire avoir', 'Ce qu\'il faut vérifier au-delà du simple prix total.'],
    ['/blog/choisir-mouton-tabaski-criteres-prix', '🐏 Bien choisir son mouton de Tabaski', 'Critères, poids et fourchette de prix pour un bon choix.'],
    ['/blog/elevage-senegal-vendre-legalement-en-ligne', '🐐 Élevage : vendre légalement ses animaux en ligne', 'Bien rédiger son annonce et fixer un prix juste.'],
    ['/blog/ordinateur-portable-etudiant-senegal', '💻 Ordinateur portable pour étudiant : lequel choisir', 'Configuration adaptée, neuf ou occasion, sans se ruiner.'],
    ['/blog/materiel-audiovisuel-location-evenement', '🎤 Matériel audiovisuel en location pour un événement', 'Sonorisation, vidéoprojecteur : bien dimensionner son besoin.'],
    ['/blog/payer-carte-bancaire-en-ligne-securite-senegal', '💳 Payer par carte bancaire en ligne : est-ce sécurisé ?', 'Les signes d\'un paiement sécurisé et les précautions à prendre.'],
    ['/blog/reperer-fausse-annonce-vendeur-non-fiable', '🚩 Repérer une fausse annonce ou un vendeur non fiable', 'Les signaux d\'alerte à connaître avant d\'acheter.'],
    ['/blog/magal-touba-organisation-transport-hebergement', '🕌 Magal de Touba : comment bien s\'organiser', 'Transport, hébergement et budget à anticiper.'],
    ['/blog/vivre-acheter-thies-saint-louis-ziguinchor', '🗺️ Vivre et acheter à Thiès, Saint-Louis, Ziguinchor', 'Ce qui distingue chaque ville sur NEXUS Market.'],
    ['/blog/troc-senegal-comment-bien-echanger', '🔄 Le troc au Sénégal : comment bien échanger', 'Rédiger une bonne annonce et sécuriser l\'échange.'],
    ['/blog/nexus-stories-decouvrir-publier-videos-vente', '🎬 NEXUS Stories : découvrir et publier des vidéos', 'Filmer une vidéo produit efficace, pourquoi ça inspire plus confiance.'],
    ['/blog/programme-fidelite-nexus-points-paliers', '⭐ Programme de fidélité NEXUS : points et paliers', 'Bronze à Platine : comment gagner et utiliser vos points.'],
    ['/blog/diaspora-senegalaise-acheter-a-distance-famille', '✈️ Diaspora : acheter à distance pour sa famille au Sénégal', 'Paiement depuis l\'étranger et livraison directe au pays.'],
    ['/blog/assistant-ia-nexus-trouver-produit', '🤖 Assistant IA NEXUS : trouver ce que vous cherchez', 'Quand l\'utiliser plutôt que la recherche classique.'],
    ['/blog/booster-ventes-vendeur-pro-nexus', '📈 Booster ses ventes sur NEXUS Market', 'Photos, prix, réactivité : les bonnes pratiques qui font la différence.'],
    ['/blog/garantie-constructeur-vs-garantie-marketplace', '🛡️ Garantie constructeur vs garantie marketplace', 'Ce qu\'il faut savoir avant d\'acheter de l\'électronique.'],
    ['/blog/location-courte-vs-longue-duree-materiel', '⏱️ Location courte durée vs longue durée', 'Comment choisir selon votre besoin réel.'],
    ['/blog/acheter-meubles-senegal-neuf-occasion', '🛋️ Acheter des meubles au Sénégal : neuf vs occasion', 'Bien choisir et gérer la livraison des pièces volumineuses.'],
    ['/blog/bijoux-artisanat-senegalais-authentique', '💎 Bijoux et artisanat sénégalais : où acheter authentique', 'Reconnaître les pièces authentiques et bien choisir son vendeur.'],
    ['/blog/ramadan-senegal-preparer-achats-budget', '🌙 Ramadan au Sénégal : préparer ses achats et son budget', 'Anticiper les hausses de prix et bien gérer son budget sur le mois.'],
    ['/blog/korite-tenues-cadeaux-preparatifs', '🎊 Korité : tenues, cadeaux et préparatifs', 'Tissus, couturiers et budget cadeaux à anticiper.'],
    ['/blog/fetes-fin-annee-senegal-cadeaux-bonnes-affaires', '🎄 Fêtes de fin d\'année : cadeaux et bonnes affaires', 'Bien anticiper son budget et ses achats de cadeaux.'],
    ['/blog/reconnaitre-vrai-cosmetique-eviter-contrefacon', '💄 Reconnaître un vrai cosmétique importé', 'Éviter les contrefaçons de crèmes et parfums de marque.'],
    ['/blog/pieces-detachees-auto-senegal-neuf-occasion', '🔩 Pièces détachées auto : neuves vs occasion', 'Quand privilégier le neuf et vérifier la compatibilité.'],
    ['/blog/reparer-electromenager-trouver-reparateur', '🔨 Réparer plutôt que jeter son électroménager', 'Comment décider et où trouver un bon réparateur.'],
    ['/blog/assurance-vehicule-senegal-ce-qu-il-faut-savoir', '🚗 Assurance véhicule au Sénégal : ce qu\'il faut savoir', 'Obligations, formules au tiers ou tous risques.'],
    ['/blog/vendre-sa-voiture-rapidement-senegal', '🔑 Vendre sa voiture rapidement au Sénégal', 'Préparation, photos et prix pour une vente efficace.'],
    ['/blog/cadeaux-entreprise-corporate-senegal', '🎁 Cadeaux d\'entreprise au Sénégal', 'Bien choisir pour ses clients et employés, à l\'unité ou en quantité.'],
    ['/blog/tenues-traditionnelles-boubou-ou-acheter', '👗 Tenues traditionnelles : où acheter boubou et tissus', 'Wax, bazin, sur-mesure ou prêt-à-porter pour une fête.'],
  ];
  const body = `
<h1>Blog NEXUS Market</h1>
<p class="lead">Conseils pratiques, actualités saisonnières et astuces pour acheter, vendre et profiter au mieux de toutes les fonctionnalités de NEXUS Market au Sénégal.</p>
<div class="cards">
${articles.map(([h, t, d]) => `<a class="card" href="${origin + h}"><h3>${t}</h3><p>${d}</p></a>`).join('')}
</div>
<h2>Envie d'un tutoriel plus complet ?</h2>
<p>Retrouvez nos guides de référence sur l'achat, la vente, le paiement mobile et la livraison au Sénégal dans notre <a href="${origin}/guides">section Guides</a>.</p>
<a class="cta" href="${origin}/">Explorer la marketplace →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog',
    title: 'Blog NEXUS Market — conseils, astuces et actualités',
    description: 'Le blog NEXUS Market : conseils pratiques, actualités saisonnières (Tabaski, Louma) et astuces pour acheter, vendre et louer au Sénégal.',
    h1: 'Blog NEXUS Market', crumbName: 'Blog', isArticle: false, bodyHtml: body,
  }));
}
