// functions/_lib/category-content.js
// Contenu éditorial (intro + FAQ) des 11 pages catégorie /categorie/:slug.
// Séparé de categories.js (référentiel canonique slug/alias/Google Merchant,
// importé par les flux produits) pour ne pas l'alourdir avec du texte.
export const CATEGORY_CONTENT = {
  electronique: {
    intro: `<h2>Acheter de l'électronique au Sénégal</h2>
<p>Téléviseurs, enceintes, appareils photo, consoles de jeux, montres connectées, éclairage : la catégorie Électronique regroupe les produits high-tech vendus par des boutiques et particuliers vérifiés partout au Sénégal. Les prix affichés sont en FCFA, le paiement se fait par Orange Money, Wave ou carte bancaire, et la livraison est disponible à Dakar comme en régions.</p>
<ul>
<li>Vérifiez toujours l'état (neuf/occasion) et la garantie dans la fiche produit avant d'acheter.</li>
<li>Pour l'électroménager, préférez les vendeurs affichant un taux de livraison élevé et des avis récents.</li>
<li>En cas de souci, la protection acheteur NEXUS couvre les litiges jusqu'à la livraison confirmée.</li>
</ul>
<p>Vous cherchez à éviter les arnaques sur du matériel high-tech d'occasion ? Consultez notre guide <a href="/guide/eviter-arnaques-achats-en-ligne-senegal">Éviter les arnaques en ligne</a>.</p>`,
    faq: [
      ["Les prix incluent-ils la livraison ?", "Le prix affiché est celui du produit ; les frais de livraison sont calculés à l'étape du paiement selon votre ville."],
      ["Puis-je payer à la livraison pour un article électronique ?", "Oui, si le vendeur propose le paiement à la livraison (COD) pour cet article — l'option apparaît au moment de la commande."],
    ],
  },
  informatique: {
    intro: `<h2>Ordinateurs, tablettes et matériel informatique</h2>
<p>Ordinateurs portables, tablettes, accessoires et services informatiques : la catégorie Informatique réunit du matériel neuf et reconditionné proposé par des vendeurs sénégalais, avec paiement Orange Money, Wave ou carte bancaire et livraison partout au pays.</p>
<ul>
<li>Sur un ordinateur d'occasion, demandez les caractéristiques précises (RAM, stockage, autonomie de la batterie) au vendeur avant l'achat.</li>
<li>Les boutiques pro affichent un badge « Vendeur vérifié » — un repère utile pour du matériel de valeur.</li>
<li>Le paiement par carte ou mobile money sur NEXUS sécurise votre achat via l'escrow de la plateforme.</li>
</ul>`,
    faq: [
      ["Le matériel informatique vendu est-il neuf ou d'occasion ?", "Les deux : chaque fiche précise l'état du produit (neuf, reconditionné ou occasion)."],
      ["Comment contacter un vendeur pour une question technique ?", "Utilisez la messagerie intégrée depuis la fiche produit, avant ou après l'achat."],
    ],
  },
  telephones: {
    intro: `<h2>Téléphones et accessoires au Sénégal</h2>
<p>Smartphones neufs et d'occasion, téléphones classiques, coques, chargeurs et accessoires : la catégorie Téléphones est l'une des plus actives de NEXUS Market, avec des centaines d'annonces de vendeurs particuliers et de boutiques à Dakar, Thiès, Saint-Louis et dans tout le pays.</p>
<ul>
<li>Avant d'acheter un smartphone d'occasion, vérifiez toujours l'IMEI et l'état de la batterie.</li>
<li>Comparez le prix affiché à la cote du marché sénégalais pour repérer une bonne affaire.</li>
<li>Vendez le vôtre facilement en suivant nos conseils pour fixer un prix juste et réaliste.</li>
</ul>
<p>Guides utiles : <a href="/guide/acheter-smartphone-occasion-senegal">acheter un smartphone d'occasion</a> et <a href="/guide/vendre-telephone-occasion-senegal">vendre son téléphone d'occasion</a>.</p>`,
    faq: [
      ["Comment vérifier qu'un téléphone d'occasion n'est pas bloqué ?", "Composez *#06# pour obtenir l'IMEI et demandez au vendeur de le confirmer avant paiement — voir notre guide dédié."],
      ["Les téléphones neufs sont-ils garantis ?", "Oui, les téléphones neufs vendus par les boutiques partenaires bénéficient de la garantie constructeur ou vendeur indiquée sur la fiche."],
    ],
  },
  mode: {
    intro: `<h2>Mode, vêtements et artisanat sénégalais</h2>
<p>Boubous, tissus wax, bijoux, chaussures, sacs et créations d'artisans locaux : la catégorie Mode &amp; Vêtements met en avant aussi bien la mode africaine que les vêtements du quotidien, pour hommes, femmes et enfants, à des prix fixés directement par les vendeurs.</p>
<ul>
<li>De nombreux créateurs proposent des pièces sur mesure — précisez vos tailles en message avant d'acheter.</li>
<li>Le wax et les tissus traditionnels sont souvent vendus au mètre : vérifiez l'unité affichée sur la fiche.</li>
<li>Soutenez l'artisanat local : chaque achat profite directement au créateur ou à la couturière.</li>
</ul>
<p>Vous êtes vendeur ou créateur ? Notre guide <a href="/guide/vendre-artisanat-mode-senegal">vendre son artisanat et sa mode africaine</a> vous aide à démarrer.</p>`,
    faq: [
      ["Puis-je commander une taille ou une couleur sur mesure ?", "Oui, contactez le vendeur via la messagerie NEXUS avant l'achat pour convenir des détails."],
      ["Les retours sont-ils possibles sur les vêtements ?", "La garantie « 30 jours satisfait ou remboursé » de NEXUS s'applique, sous réserve que l'article n'ait pas été porté."],
    ],
  },
  alimentation: {
    intro: `<h2>Produits locaux et alimentation au Sénégal</h2>
<p>Riz, mil, huile, épices, produits laitiers, boissons et spécialités du terroir : la catégorie Alimentation valorise les producteurs et commerçants sénégalais qui vendent en direct, sans intermédiaire, avec livraison à domicile dans les grandes villes.</p>
<ul>
<li>Privilégiez les produits « bio &amp; locaux » pour soutenir les producteurs de votre région.</li>
<li>Vérifiez les dates de péremption indiquées par le vendeur pour les produits périssables.</li>
<li>Pour les grosses quantités (mariages, événements), contactez le vendeur pour un tarif dégressif.</li>
</ul>
<p>À lire : notre guide <a href="/guide/produits-locaux-terroir-senegal">produits locaux &amp; du terroir</a>.</p>`,
    faq: [
      ["Les produits alimentaires sont-ils livrés partout au Sénégal ?", "La livraison dépend du vendeur et de la nature du produit (frais/périssable) — la disponibilité s'affiche à la commande."],
      ["Comment savoir si un produit est artisanal ou industriel ?", "La description du vendeur précise l'origine ; n'hésitez pas à demander plus de détails par message."],
    ],
  },
  maison: {
    intro: `<h2>Maison, déco et électroménager</h2>
<p>Meubles, électroménager, cuisine, linge de maison, jardinage et bricolage : la catégorie Maison &amp; Déco regroupe tout ce qu'il faut pour équiper ou décorer un logement au Sénégal, du mobilier artisanal aux appareils électroménagers de marque.</p>
<ul>
<li>Pour les meubles volumineux, vérifiez les options de livraison et les dimensions avant de commander.</li>
<li>L'électroménager d'occasion doit toujours être testé ou décrit avec précision par le vendeur.</li>
<li>Les artisans locaux proposent souvent des meubles sur mesure — un message suffit pour un devis.</li>
</ul>`,
    faq: [
      ["La livraison des meubles volumineux est-elle possible en dehors de Dakar ?", "Oui, via le réseau de coursiers et transporteurs partenaires ; le délai et le tarif varient selon la ville et le volume."],
      ["Puis-je faire fabriquer un meuble sur mesure ?", "Oui, de nombreux artisans acceptent les commandes personnalisées — contactez-les directement depuis leur fiche."],
    ],
  },
  beaute: {
    intro: `<h2>Beauté, cosmétiques et bien-être</h2>
<p>Cosmétiques, parfums, soins capillaires et produits de bien-être : la catégorie Beauté &amp; Santé rassemble des marques internationales et des créations locales (savons naturels, huiles, produits capillaires africains) vendues par des boutiques et particuliers.</p>
<ul>
<li>Vérifiez la date de fabrication/péremption sur la fiche avant d'acheter des cosmétiques.</li>
<li>Les produits capillaires et de soin de la peau adaptés au climat sahélien sont particulièrement recherchés.</li>
<li>En cas de doute sur l'authenticité d'un produit de marque, privilégiez les vendeurs vérifiés.</li>
</ul>`,
    faq: [
      ["Les produits de beauté vendus sont-ils authentiques ?", "Les vendeurs vérifiés s'engagent sur l'authenticité des produits de marque ; signalez tout doute au support NEXUS."],
      ["Puis-je demander conseil avant d'acheter un produit de soin ?", "Oui, contactez le vendeur par message pour toute question sur la composition ou l'usage du produit."],
    ],
  },
  sport: {
    intro: `<h2>Sport, loisirs, livres et jouets</h2>
<p>Équipements sportifs, jouets, instruments de musique, livres (papier, eBooks, BD, manuels scolaires) et objets de collection : la catégorie Sport &amp; Loisirs est l'une des plus variées de NEXUS Market, avec des annonces adaptées à tous les budgets.</p>
<ul>
<li>Les livres numériques (PDF/eBooks) sont téléchargeables directement après paiement confirmé.</li>
<li>Pour le matériel de sport d'occasion, demandez l'état d'usure avant d'acheter.</li>
<li>La rentrée scolaire est la période idéale pour trouver des manuels à prix réduit.</li>
</ul>`,
    faq: [
      ["Comment récupérer un livre numérique après l'achat ?", "Le lien de téléchargement apparaît dans votre commande dès que le paiement est confirmé (immédiat par carte, ou après validation pour les autres moyens)."],
      ["Vend-on des instruments de musique d'occasion sur NEXUS ?", "Oui, dans la catégorie Sport & Loisirs — vérifiez l'état de l'instrument avec le vendeur avant l'achat."],
    ],
  },
  services: {
    intro: `<h2>Services à domicile, formation et immobilier</h2>
<p>Services à domicile, formations, événementiel, BTP, immobilier (location/vente) et fournitures professionnelles : la catégorie Services couvre les besoins des particuliers comme des entreprises au Sénégal, avec des prestataires locaux référencés.</p>
<ul>
<li>Pour un artisan (plombier, électricien, maçon), utilisez le module NEXUS Pro intégré à l'application, qui géolocalise les professionnels près de chez vous.</li>
<li>En immobilier, demandez toujours une visite avant tout engagement financier.</li>
<li>Les prestations BTP et événementiel se négocient généralement sur devis personnalisé.</li>
</ul>`,
    faq: [
      ["Comment trouver un artisan proche de chez moi ?", "Utilisez NEXUS Pro, qui géolocalise les ouvriers et artisans disponibles dans votre zone."],
      ["Les annonces immobilières sont-elles vérifiées ?", "Chaque annonceur est identifié sur la plateforme ; vérifiez toujours le bien en personne avant tout paiement."],
    ],
  },
  auto: {
    intro: `<h2>Voitures, motos et pièces détachées</h2>
<p>Voitures, motos, scooters, vélos et pièces &amp; accessoires : la catégorie Auto &amp; Moto rassemble des annonces de particuliers et de professionnels de l'automobile au Sénégal, des véhicules d'occasion aux pièces détachées.</p>
<ul>
<li>Demandez toujours la carte grise et l'historique d'entretien avant l'achat d'un véhicule d'occasion.</li>
<li>Privilégiez un essai routier et, si possible, un contrôle technique récent.</li>
<li>Pour les pièces détachées, vérifiez la compatibilité avec le modèle exact de votre véhicule.</li>
</ul>`,
    faq: [
      ["Comment vérifier qu'un véhicule n'est pas gagé ?", "Demandez au vendeur les documents officiels (carte grise, certificat de non-gage) avant toute transaction."],
      ["Le paiement à la livraison est-il possible pour un véhicule ?", "Cela dépend du vendeur ; pour les montants élevés, un paiement sécurisé via NEXUS (carte/mobile money) est recommandé."],
    ],
  },
  animaux: {
    intro: `<h2>Élevage, bétail et animaux de compagnie</h2>
<p>Moutons, bovins, volaille, animaux de compagnie et accessoires : la catégorie Animaux &amp; Élevage connecte les éleveurs sénégalais aux acheteurs, avec un pic d'activité avant la Tabaski pour les moutons et le bétail.</p>
<ul>
<li>Pour un mouton de Tabaski, vérifiez l'âge, le poids et l'état de santé avant l'achat.</li>
<li>Les éleveurs proches de chez vous sont géolocalisables via <a href="/elevage">NEXUS Élevage</a>.</li>
<li>Pour les animaux de compagnie, demandez un carnet de santé ou de vaccination si disponible.</li>
</ul>
<p>À lire avant l'Aïd : <a href="/guide/acheter-mouton-tabaski-senegal">acheter un mouton de Tabaski</a>.</p>`,
    faq: [
      ["Comment trouver un éleveur près de chez moi ?", "Activez votre position sur NEXUS Élevage pour voir les éleveurs géolocalisés autour de vous."],
      ["Quand commander son mouton de Tabaski ?", "Idéalement 2 à 3 semaines avant l'Aïd, pour avoir le plus grand choix avant la hausse de la demande."],
    ],
  },
};
