// functions/cgu.js → /cgu — Conditions Générales d'Utilisation (server-rendered, indexable).
// [ADMIN-CFG 2026-08-23] Les coordonnées légales (email, tél, adresse) et le
// contact RGPD sont désormais lus depuis app_config.nexus_org_cfg — plus
// d'email/tél personnels figés dans le code (risque RGPD + doxxing).
import { renderContentPage, contentResponse } from './_lib/contentpage.js';
import { esc } from './_lib/seo.js';
import { getOrgCfg } from './_lib/org-cfg.js';

// Placeholders remplacés à chaque requête depuis nexus_org_cfg :
//   {{legal_email}} {{legal_phone}} {{legal_address}} {{rgpd_email}}
const SECTIONS = [
  ['1. Objet et champ d’application', "Les présentes Conditions Générales d’Utilisation (CGU) régissent l’utilisation de la plateforme NEXUS Market (nexusmarket.sn), place de marché B2B/B2C en ligne dédiée au commerce électronique au Sénégal et en Afrique de l’Ouest. En accédant au site ou en créant un compte, vous acceptez sans réserve les présentes CGU dans leur intégralité. Si vous n’acceptez pas ces conditions, vous devez cesser d’utiliser la plateforme."],
  ['2. Opérateur de la plateforme', "NEXUS Market est exploité par NEXUS Market, entreprise en cours d’immatriculation au registre du commerce et du crédit mobilier (RCCM) de Dakar, Sénégal. Contact : {{legal_email}}{{legal_phone_sep}} — Adresse : {{legal_address}}."],
  ['3. Accès et inscription', "L’inscription est gratuite et ouverte à toute personne physique majeure (+18 ans) ou personne morale légalement constituée. Les Annonces Express sont accessibles sans inscription. Vous êtes entièrement responsable de la sécurité de vos identifiants et de tous les actes accomplis depuis votre compte. NEXUS Market se réserve le droit de suspendre ou supprimer tout compte en cas de violation des présentes CGU."],
  ['4. Vendeurs — Obligations et commissions', "Les vendeurs sont des tiers indépendants. Ils s’engagent à : (i) vendre uniquement des produits légaux, conformes aux normes en vigueur au Sénégal ; (ii) honorer leurs commandes dans les délais annoncés ; (iii) fournir des informations exactes sur leurs produits. Pendant la phase de lancement, NEXUS Market applique une commission de 0% sur les ventes ; elle évoluera ensuite progressivement, avec un taux réduit pour les vendeurs parrainés. Le taux applicable est toujours affiché dans le tableau de bord vendeur et déduit automatiquement du montant versé au vendeur."],
  ['5. Protection acheteur — Système Escrow', "NEXUS Market propose un système de protection acheteur (escrow) : le paiement est sécurisé et n’est versé au vendeur qu’après confirmation de la réception par l’acheteur, ou automatiquement après 48h sans litige. En cas de litige, l’acheteur dispose de 48h ouvrables après livraison pour ouvrir une réclamation. NEXUS Market agit comme médiateur neutre et rend une décision sous 72h ouvrables. Cette médiation est gratuite."],
  ['6. Paiements', "Les paiements sont acceptés via : Wave, Orange Money, carte bancaire (Visa/Mastercard via Stripe) et PayTech. Les transactions sont sécurisées par chiffrement TLS. NEXUS Market ne stocke aucun numéro de carte bancaire. Les remboursements sont effectués via le même mode de paiement sous 5 jours ouvrables après validation de la réclamation."],
  ['7. Annonces Express (sans inscription)', "Les Annonces Express permettent de publier une petite annonce sans créer de compte, à titre gratuit. L’annonceur est entièrement responsable du contenu de son annonce. NEXUS Market se réserve le droit de supprimer toute annonce contraire à la loi ou aux bonnes mœurs. Les annonces expirent automatiquement après 30 jours."],
  ['8. Contenus interdits', "Sont strictement interdits sur la plateforme : armes, drogues, médicaments sans ordonnance, contrefaçons, produits volés, matériel pornographique, contenus haineux ou discriminatoires, et tout produit ou service illégal au Sénégal. Tout manquement entraîne la suppression immédiate du compte et peut faire l’objet d’un signalement aux autorités compétentes."],
  ['9. Programme Ambassadeur', "Le programme ambassadeur est accessible à tout utilisateur inscrit. Les commissions (5 à 10% selon le niveau) sont calculées sur les ventes effectives des filleuls et versées mensuellement par Wave ou Orange Money. NEXUS Market se réserve le droit de modifier les taux avec un préavis de 30 jours. Les commissions ne sont pas acquises sur les commandes annulées ou remboursées."],
  ['10. Propriété intellectuelle', "La marque NEXUS Market, le code source, le design, les logos et l’ensemble des éléments graphiques de la plateforme sont la propriété exclusive de NEXUS Market et sont protégés par les lois sénégalaises et internationales. Toute reproduction, distribution ou utilisation commerciale sans autorisation écrite préalable est interdite."],
  ['11. Protection des données personnelles (Loi 2008-12)', "NEXUS Market traite vos données personnelles conformément à la loi sénégalaise n°2008-12 sur la protection des données personnelles et aux règlements CEDEAO en vigueur. Voir notre Politique de confidentialité pour le détail. Vous disposez d’un droit d’accès, de rectification et de suppression en contactant {{rgpd_email}}."],
  ['12. Responsabilité et limitation', "NEXUS Market est une plateforme intermédiaire entre acheteurs et vendeurs indépendants. NEXUS Market n’est pas responsable de la qualité des produits vendus par les tiers, ni des retards de livraison imputables aux transporteurs. Sa responsabilité est limitée au montant de la transaction concernée et ne saurait couvrir les dommages indirects ou consécutifs."],
  ['13. Modification des CGU', "NEXUS Market se réserve le droit de modifier les présentes CGU à tout moment. Les modifications prennent effet 30 jours après leur publication sur la plateforme. Les utilisateurs sont notifiés par email et notification in-app. La poursuite de l’utilisation après ce délai vaut acceptation des nouvelles CGU."],
  ['14. Loi applicable et juridiction', "Les présentes CGU sont régies par le droit sénégalais : Code des Obligations Civiles et Commerciales (COCC), Acte Uniforme OHADA sur le Droit Commercial Général, loi n°2008-08 sur les transactions électroniques et loi n°2008-12 sur la protection des données personnelles. Tout litige non résolu par médiation sera soumis à la compétence exclusive des tribunaux de Dakar, Sénégal."],
  ['15. Données agrégées et anonymisées', "NEXUS Market peut produire et exploiter des statistiques de marché (prix moyens, tendances, volumes) issues de l’activité de la plateforme. Ces données sont strictement agrégées et anonymisées : aucun vendeur ni acheteur individuel n’est identifiable, conformément à la loi n°2008-12."],
  ['16. Fonds en séquestre (escrow)', "Les sommes versées par les acheteurs sont conservées en séquestre jusqu’à confirmation de la livraison, puis reversées au vendeur déduction faite de la commission. Durant la phase de lancement, le montant protégé par transaction peut être plafonné pour des raisons de sécurité."],
  ['17. Premier achat garanti (offre de lancement)', "En cas de fraude avérée d’un vendeur lors de votre toute première commande payée via la plateforme, NEXUS vous rembourse intégralement le montant payé, dans la limite du plafond en vigueur et sous réserve d’ouverture d’une réclamation dans les 48h suivant la livraison (ou la date prévue). Cette garantie s’applique exclusivement aux transactions réglées via le système de protection (escrow) ; les paiements hors plateforme en sont exclus."],
  // [RENFORCEMENT JURIDIQUE 2026-08-26] Sections 18-25 : avertissements et clauses
  // de responsabilité spécifiques aux verticales à risque (rencontres en personne,
  // immobilier, animaux vivants, prestataires indépendants, catalogue agrégé,
  // contenus utilisateurs, contrefaçon, force majeure). Identifiées à la demande
  // de l'utilisateur pour compléter les CGU existantes — cf. JOURNAL.md pour le
  // détail de l'analyse. ⚠️ Contenu rédigé par IA à partir des cadres déjà cités
  // dans ce fichier (COCC, Actes Uniformes OHADA, lois 2008-08/2008-12) : à faire
  // relire par un juriste sénégalais avant de s'appuyer dessus en cas de litige réel.
  ['18. Avertissement — Rencontres en personne (Troc, Annonces Express, remise directe)', "Les Annonces Express, le Troc et certaines mises en relation (Pros, Coursiers, Dépannage) impliquent une rencontre en personne entre utilisateurs. Pour votre sécurité : ne versez jamais d’acompte en dehors du système de protection (escrow, article 5) ; donnez rendez-vous dans un lieu public et fréquenté, de préférence en journée ; vérifiez le produit ou la prestation avant tout paiement ; informez un proche de votre rendez-vous. NEXUS Market ne participe pas à ces rencontres et décline toute responsabilité en cas d’incident (vol, agression, escroquerie) survenant lors d’un échange direct entre utilisateurs. Tout comportement suspect peut être signalé à {{legal_email}} et, si nécessaire, aux autorités compétentes."],
  ['19. Immobilier — Avertissement et limitation de responsabilité', "Les annonces de la catégorie Immobilier sont, pour la plupart, des informations de mise en relation (annuaire d’agences, biens à titre indicatif) : NEXUS Market n’est ni agent immobilier, ni partie à la transaction, ni garant de l’exactitude des informations publiées (prix, surface, disponibilité, titre de propriété). Certaines fiches affichent une photo d’illustration générique lorsque le bien n’a pas de photo réelle disponible (voir Crédits photographiques ci-dessous). Avant tout engagement financier, l’utilisateur doit vérifier directement auprès de l’agence ou du propriétaire annoncé : l’existence du bien, la validité du titre foncier ou du bail, l’identité du vendeur ou bailleur, et toute information déterminante. NEXUS Market recommande de ne jamais verser d’acompte ou de caution en dehors d’un cadre notarié ou d’une agence dûment identifiée, et décline toute responsabilité en cas de litige, de fraude ou de vice caché relatif à un bien immobilier annoncé sur la plateforme."],
  ['20. Élevage et vente d’animaux vivants — Avertissement', "Les annonces d’élevage portent sur des animaux vivants. NEXUS Market ne vérifie ni l’état de santé, ni le statut vaccinal, ni les conditions d’élevage des animaux annoncés. L’éleveur reste seul responsable du respect de la réglementation sénégalaise applicable à l’élevage, au transport et à la vente d’animaux. L’acheteur est invité à examiner l’animal avant toute finalisation de l’achat et à exiger, le cas échéant, un certificat vétérinaire. NEXUS Market décline toute responsabilité en cas de maladie, de mortalité ou de non-conformité de l’animal constatée après la transaction."],
  ['21. Services Pro, Coursiers et Dépannage — Statut d’intermédiaire', "Les prestataires référencés dans les catégories Pros (artisans), Coursiers et Dépannage (assistance routière) sont des indépendants, non employés ni mandataires de NEXUS Market. La plateforme se limite à faciliter la mise en relation ; elle ne fournit aucune assurance de responsabilité civile professionnelle, ni garantie sur la qualité, la sécurité ou la conformité des prestations exécutées. Il appartient à l’utilisateur de vérifier les qualifications, l’assurance et les références du prestataire avant toute intervention, en particulier pour des travaux techniques ou sur véhicule. NEXUS Market ne saurait être tenu responsable d’un dommage corporel, matériel ou financier survenant à l’occasion d’une prestation réalisée par un prestataire tiers référencé sur la plateforme."],
  ['22. Catalogue agrégé et contenu importé — Exactitude non garantie', "Une partie du catalogue produits (notamment électronique, immobilier et location) est constituée à partir de sources publiques agrégées ou d’imports en masse, et peut ne pas refléter en temps réel la disponibilité, le prix ou l’état exact d’un article chez le vendeur d’origine. NEXUS Market s’efforce de maintenir ces informations à jour mais ne garantit pas leur exactitude absolue. Avant tout achat, l’acheteur est invité à confirmer les caractéristiques du produit avec le vendeur via la messagerie de la plateforme. Toute divergence constatée après commande peut faire l’objet d’une réclamation via le système de protection acheteur (escrow, article 5)."],
  ['23. Contenus publiés par les utilisateurs (avis, messages, Stories)', "Les avis, messages, images et vidéos (Stories) publiés par les utilisateurs relèvent de leur seule responsabilité. En publiant un contenu, l’utilisateur garantit détenir les droits nécessaires (image, musique, marque) et s’engage à ne publier aucun contenu diffamatoire, mensonger, trompeur ou portant atteinte aux droits d’un tiers. NEXUS Market n’exerce pas de contrôle éditorial préalable systématique mais se réserve le droit de retirer tout contenu signalé comme contraire aux présentes CGU ou à la loi, et de suspendre le compte de son auteur. Un contenu jugé illicite peut être signalé à {{legal_email}}."],
  ['24. Propriété intellectuelle des tiers — Procédure de signalement', "Toute personne s’estimant victime d’une contrefaçon, d’une utilisation non autorisée de sa marque, de son image ou de son œuvre sur la plateforme peut adresser une notification motivée à {{legal_email}}, précisant : le contenu concerné (lien ou référence), les droits invoqués et un justificatif d’identité ou de titularité. NEXUS Market examine chaque signalement et peut retirer le contenu litigieux ou suspendre le compte concerné dans l’attente d’éclaircissement, sans que ce retrait ne constitue une reconnaissance de responsabilité de la plateforme."],
  ['25. Force majeure', "NEXUS Market ne saurait être tenu responsable d’un retard ou d’une inexécution résultant d’un cas de force majeure : catastrophe naturelle, épidémie, décision gouvernementale, coupure prolongée d’électricité ou de réseau, grève, trouble à l’ordre public, ou tout autre événement imprévisible et irrésistible échappant à son contrôle raisonnable."],
];

function applyOrg(str, cfg) {
  const phoneSep = cfg.legal_phone ? ` — Tél. : ${cfg.legal_phone}` : '';
  return String(str || '')
    .replaceAll('{{legal_email}}', esc(cfg.legal_email))
    .replaceAll('{{legal_phone_sep}}', esc(phoneSep))
    .replaceAll('{{legal_address}}', esc(cfg.legal_address))
    .replaceAll('{{rgpd_email}}', esc(cfg.rgpd_email));
}

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const cfg = await getOrgCfg(env);
  const contactLine = `${esc(cfg.legal_email)}${cfg.legal_phone ? ` — ${esc(cfg.legal_phone)}` : ''} — ${esc(cfg.legal_address)}`;

  // [AUDIT ADSENSE 2026-08-26] Crédits photographiques — les fiches Immobilier
  // + Location vitrine (sql/2026_08_26_fix_immobilier_location_photos.sql)
  // utilisent des photos génériques Wikimedia Commons (aucune de ces annonces
  // n'a jamais eu de vraie photo). Certaines sont sous licence CC BY / CC
  // BY-SA, qui exigent une attribution visible — publiée ici faute de page
  // « mentions légales » dédiée sur le site.
  const PHOTO_CREDITS = [
    ['Appartement / studio', '"Modern living room with stylish furniture and a view of the outdoors in a cozy apartment setting" — Shixart1985', 'CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/'],
    ['Villa', '"Croix villa cavrois depuis jardin" — Velvet', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
    ['Terrain', '"Vacant plot of land" — Richard Sutcliffe', 'CC BY-SA 2.0', 'https://creativecommons.org/licenses/by-sa/2.0/'],
    ['Bureau', '"Desks in an open office space (Unsplash)" — Crew crew', 'CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
    ['Local commercial', '"A vacant retail storefront at The Shops at Willow Bend in Plano, Texas" — Jackilometresan', 'CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
    ['Immeuble', '"F. E. Cottrell apartment building, exterior views" — Dewees, John Michael', 'CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
    ['Location (matériel événementiel)', '"Marquee tents for events" — Barbieri.wiki', 'CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0/'],
  ];
  const photoCreditsHtml = PHOTO_CREDITS.map(([usage, credit, license, licenseUrl]) =>
    `<li>${esc(usage)} : ${esc(credit)}, licence <a href="${esc(licenseUrl)}" rel="nofollow noopener" target="_blank">${esc(license)}</a>, via Wikimedia Commons.</li>`
  ).join('\n');

  const body = `
<h1>Conditions Générales d’Utilisation</h1>
<p class="lead">Dernière mise à jour : juin 2026 — NEXUS Market, marketplace en ligne au Sénégal. Les présentes CGU encadrent l’usage de la plateforme par les acheteurs, les vendeurs et les visiteurs.</p>
${SECTIONS.map(([t, x]) => `<h2>${esc(t)}</h2><p>${applyOrg(x, cfg)}</p>`).join('\n')}

<h2>Crédits photographiques</h2>
<p>Certaines fiches Immobilier et Location affichent une photo générique d’illustration (le bien annoncé n’a pas de photo réelle disponible), sous licence libre :</p>
<ul>
${photoCreditsHtml}
</ul>

<div class="box"><strong>Contact réclamations :</strong> ${contactLine}. Voir aussi notre <a href="${origin}/confidentialite">Politique de confidentialité</a>.</div>`;

  return contentResponse(renderContentPage({
    origin, path: '/cgu',
    title: 'Conditions Générales d’Utilisation (CGU)',
    description: 'Conditions Générales d’Utilisation de NEXUS Market : inscription, vendeurs, protection acheteur, paiements, contenus interdits, données personnelles et droit applicable au Sénégal.',
    h1: 'Conditions Générales d’Utilisation', crumbName: 'CGU',
    isArticle: false, bodyHtml: body,
  }));
}
