// functions/ville/[slug].js → /ville/:slug
// Page d'atterrissage SEO locale : annonces express d'une ville du Sénégal.
// Capte les recherches géolocalisées (« acheter à Thiès », « annonces Saint-Louis »).
import { renderListPage, render404, sbGet, buildFaqBlock } from '../_lib/seo.js';
import { slugify } from '../_lib/categories.js';
import { cachedResponse } from '../_lib/edgecache.js';

// Principales villes du Sénégal (slug → libellé + variantes DB + contenu local).
const VILLES = [
  { slug: 'dakar',       label: 'Dakar',       aliases: ['Dakar'],
    intro: `<h2>Petites annonces à Dakar</h2>
<p>Capitale économique du Sénégal, Dakar concentre la plus forte activité de NEXUS Market : électronique, mode, véhicules, services et produits locaux s'y échangent chaque jour entre particuliers et boutiques, du Plateau à Guédiawaye en passant par les Parcelles Assainies et Pikine.</p>
<p>La livraison à Dakar est généralement assurée en 24 à 48h par coursier, avec paiement Orange Money, Wave ou carte bancaire à la commande, ou en espèces à la réception selon le vendeur.</p>` },
  { slug: 'thies',       label: 'Thiès',       aliases: ['Thiès', 'Thies'],
    intro: `<h2>Petites annonces à Thiès</h2>
<p>Deuxième ville du Sénégal et carrefour ferroviaire historique, Thiès accueille une communauté active de vendeurs sur NEXUS Market, notamment en électronique, mode et produits agricoles issus de sa région, l'une des plus fertiles du pays.</p>
<p>La livraison depuis Dakar prend généralement 1 à 3 jours ; de nombreux vendeurs locaux proposent aussi la remise en main propre.</p>` },
  { slug: 'saint-louis', label: 'Saint-Louis', aliases: ['Saint-Louis', 'Saint Louis'],
    intro: `<h2>Petites annonces à Saint-Louis</h2>
<p>Ancienne capitale de l'Afrique-Occidentale française et ville classée au patrimoine mondial de l'UNESCO, Saint-Louis rassemble sur NEXUS Market des annonces variées : artisanat local, mode, produits de la pêche et services, portées par une économie tournée vers le tourisme et l'agriculture de la vallée du fleuve Sénégal.</p>
<p>Livraison régionale disponible sous 2 à 4 jours ouvrés selon le vendeur.</p>` },
  { slug: 'touba',       label: 'Touba',       aliases: ['Touba'],
    intro: `<h2>Petites annonces à Touba</h2>
<p>Ville sainte du mouridisme et l'une des agglomérations les plus peuplées du Sénégal, Touba connaît une activité commerciale intense sur NEXUS Market, en particulier autour du Grand Magal, avec des pics de demande en textile, alimentation et produits religieux.</p>
<p>La livraison est assurée par les coursiers partenaires ; comptez 1 à 3 jours selon la période.</p>` },
  { slug: 'rufisque',    label: 'Rufisque',    aliases: ['Rufisque'],
    intro: `<h2>Petites annonces à Rufisque</h2>
<p>Commune historique de la région de Dakar, Rufisque bénéficie de la même couverture logistique que la capitale : livraison rapide, large choix de catégories (électronique, mode, maison) et de nombreux vendeurs locaux référencés sur NEXUS Market.</p>` },
  { slug: 'kaolack',     label: 'Kaolack',     aliases: ['Kaolack'],
    intro: `<h2>Petites annonces à Kaolack</h2>
<p>Carrefour commercial du bassin arachidier, Kaolack est un pôle historique d'échanges au Sénégal. Sur NEXUS Market, la ville se distingue par une offre solide en alimentation, produits locaux et matériel agricole, en plus des catégories classiques.</p>` },
  { slug: 'mbour',       label: 'Mbour',       aliases: ['Mbour'],
    intro: `<h2>Petites annonces à Mbour</h2>
<p>Ville côtière et pôle touristique de la Petite Côte, Mbour propose sur NEXUS Market des annonces liées à la pêche, à l'artisanat et aux produits du quotidien, avec une forte présence de vendeurs particuliers dans la région de Thiès élargie.</p>` },
  { slug: 'ziguinchor',  label: 'Ziguinchor',  aliases: ['Ziguinchor'],
    intro: `<h2>Petites annonces à Ziguinchor</h2>
<p>Capitale de la Casamance, Ziguinchor met en avant sur NEXUS Market des produits agricoles typiques du Sud (riz, fruits, huile de palme) ainsi que de l'artisanat local. La livraison depuis Dakar peut prendre 3 à 7 jours selon la disponibilité des transporteurs.</p>` },
  { slug: 'diourbel',    label: 'Diourbel',    aliases: ['Diourbel'],
    intro: `<h2>Petites annonces à Diourbel</h2>
<p>Chef-lieu de la région du même nom, au cœur du bassin arachidier, Diourbel propose sur NEXUS Market des annonces couvrant l'agriculture, l'élevage et les besoins du quotidien pour les particuliers et petits commerces locaux.</p>` },
  { slug: 'louga',       label: 'Louga',       aliases: ['Louga'],
    intro: `<h2>Petites annonces à Louga</h2>
<p>Ville du Nord réputée pour son dynamisme commercial et sa diaspora, Louga rassemble sur NEXUS Market des annonces en mode, électronique et élevage, avec une clientèle habituée aux transferts d'argent mobile (Orange Money, Wave) pour les achats à distance.</p>` },
  { slug: 'tambacounda', label: 'Tambacounda', aliases: ['Tambacounda'],
    intro: `<h2>Petites annonces à Tambacounda</h2>
<p>Plus grande région du Sénégal par sa superficie, Tambacounda est un carrefour vers le Mali et la Guinée. Sur NEXUS Market, la ville est un point d'accès privilégié pour l'élevage, l'agriculture et les produits de première nécessité de l'est du pays.</p>` },
  { slug: 'kolda',       label: 'Kolda',       aliases: ['Kolda'],
    intro: `<h2>Petites annonces à Kolda</h2>
<p>Cœur de la Haute Casamance, Kolda propose sur NEXUS Market des annonces centrées sur l'agriculture, l'élevage et l'artisanat régional, avec un paiement mobile money largement adopté par les vendeurs locaux.</p>` },
];

const VILLE_FAQ = [
  ["Comment vérifier qu'un vendeur est bien situé dans ma ville ?", "La ville indiquée sur l'annonce correspond à la localisation déclarée par le vendeur ; utilisez la messagerie pour confirmer les modalités de remise ou de livraison."],
  ["Le paiement à la livraison est-il disponible dans toutes les villes ?", "Cela dépend du vendeur et de la distance : certaines zones éloignées de Dakar privilégient le paiement à la commande (Orange Money, Wave, carte)."],
];

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const s = slugify(params.slug);
  const ville = VILLES.find(v => v.slug === s);
  if (!ville) return render404(origin, "Cette ville n'est pas couverte.");

  const ors = ville.aliases.map(a => `city.eq.${encodeURIComponent(a)}`).join(',');
  const rows = await sbGet(env, `annonces_express?select=id,category,description,photo_url,price_fcfa&status=eq.active&or=(${ors})&order=created_at.desc&limit=100`);

  const items = (rows || []).map(a => {
    const t = String(a.description || '').replace(/\s+/g, ' ').trim().split(/[.\n!?]/)[0].slice(0, 60);
    return {
      id: a.id, kind: 'annonce',
      title: t || `${a.category || 'Annonce'} à ${ville.label}`,
      image: a.photo_url, priceFcfa: a.price_fcfa,
    };
  });

  const url = `${origin}/ville/${ville.slug}`;
  const { html: faqHtml, jsonld: faqJsonld } = buildFaqBlock(VILLE_FAQ);
  const html = renderListPage({
    origin, url, title: `Annonces à ${ville.label}`,
    description: `Petites annonces et bons plans à ${ville.label} (Sénégal) sur NEXUS Market : ${items.length} annonces en ligne. Achetez et vendez près de chez vous, paiement Orange Money & Wave, livraison locale.`,
    image: items[0] && items[0].image,
    items,
    introHtml: ville.intro ? `<div class="body-content">${ville.intro}</div>` : '',
    faqHtml,
    jsonldExtra: faqJsonld ? [faqJsonld] : [],
    breadcrumb: [
      { name: 'Accueil', url: `${origin}/` },
      { name: `Annonces ${ville.label}`, url },
    ],
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
  });
}
