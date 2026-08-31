// functions/ligne/[id].js → /ligne/:id
// Page d'atterrissage SEO d'une ligne de transport régulière (bus/car/ferry/7-places
// — table transport_lines, annuaire public sans vendor_id, sql/2026_08_10_transport_lines.sql).
// Contenu réel et unique par ligne (opérateur, trajet, prix, horaires, services) —
// contrairement aux fiches "vitrine" (products.rental_specs.is_vitrine), pas de
// prix factice ici : price_fcfa est un vrai tarif publié par l'opérateur.
// Indexable (méta + JSON-LD Service + Breadcrumb). Annuaire public → contact affiché
// tel quel (déjà public sur la page Facebook/le site de l'opérateur), pas de
// redaction RT-01 (celle-ci vise les vendeurs marketplace, pas cet annuaire).
import { esc, render404, sbGetOne } from '../_lib/seo.js';
import { cachedResponse } from '../_lib/edgecache.js';

const VEHICLE_LABELS = {
  bus: 'Bus', minibus: 'Minibus', voiture: 'Voiture/VTC',
  '7_places': '7 places', ferry: 'Ferry', van: 'Van',
};

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const id = params.id;
  const t = await sbGetOne(
    env,
    `transport_lines?select=id,operator,vehicle_type,origin_city,origin_gare,destinations,destination_main,` +
    `arrival_gare,phone,url_facebook,url_site,price_fcfa,price_vip_fcfa,price_child_fcfa,price_luggage,` +
    `duration,seats,climatise,escales,services,reservation,luggage_included,reservation_mode,` +
    `horaire_depart_raw,horaire_arrivee_raw,notes,updated_at,collected_at&id=eq.${encodeURIComponent(id)}&active=eq.true&limit=1`
  );
  if (!t) return render404(origin, "Cette ligne de transport n'est plus disponible.");

  const url = `${origin}/ligne/${encodeURIComponent(t.id)}`;
  const appUrl = `${origin}/?covoiturage=1&ligne=${encodeURIComponent(t.id)}`;
  const vehicleLabel = VEHICLE_LABELS[t.vehicle_type] || 'Transport';
  // Lignes urbaines AFTU (TATA) : destinations = "Ligne N : Départ → Arrivée" —
  // en extraire le numéro pour un titre plus identifiable ("AFTU Ligne 12" plutôt
  // que juste "AFTU"), sans ajouter de colonne dédiée pour ce seul usage.
  const ligneMatch = /^Ligne\s+(\d+)\s*:/i.exec(t.destinations || '');
  const operatorLabel = ligneMatch ? `${t.operator} Ligne ${ligneMatch[1]}` : t.operator;
  const title = `${operatorLabel} — ${t.origin_city} → ${t.destination_main || (t.destinations || '').split('|')[0]}`;
  const priceTxt = t.price_fcfa ? `${Number(t.price_fcfa).toLocaleString('fr-FR')} FCFA` : '';
  // Pas de photo par ligne en base (transport_lines n'a pas de colonne image) →
  // image de partage générique du site, comme le fait déjà produit/[id].js pour
  // les fiches vitrine sans photo. Sans ça, un lien /ligne/ partagé sur
  // WhatsApp/Facebook n'affichait aucune vignette dans l'aperçu.
  const img = `${origin}/og-image.png`;

  const descParts = [
    `${vehicleLabel} ${t.operator} : ${t.origin_city} → ${t.destination_main || (t.destinations || '').split('|')[0]}.`,
    t.duration ? `Durée : ${t.duration}.` : '',
    priceTxt ? `Prix : ${priceTxt}.` : 'Tarif variable, contactez l\'opérateur.',
    t.services ? `Services : ${t.services.replace(/\|/g, ', ')}.` : '',
  ].filter(Boolean);
  const desc = descParts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 300);

  const service = {
    '@type': 'Service', serviceType: `Transport ${vehicleLabel.toLowerCase()}`,
    name: title, description: desc, url, image: [img],
    provider: { '@type': 'Organization', name: t.operator, ...(t.url_site ? { url: t.url_site } : {}) },
    areaServed: [t.origin_city, t.destination_main].filter(Boolean).map(n => ({ '@type': 'City', name: n })),
  };
  if (t.price_fcfa) {
    service.offers = {
      '@type': 'Offer', price: Number(t.price_fcfa), priceCurrency: 'XOF',
      availability: 'https://schema.org/InStock', url,
    };
  }
  const crumbs = [
    { name: 'Accueil', url: `${origin}/` },
    { name: 'Covoiturage & transport', url: `${origin}/covoiturage` },
    { name: title, url },
  ];
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
  const graph = JSON.stringify({ '@context': 'https://schema.org', '@graph': [service, breadcrumb] })
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

  const crumbHtml = crumbs.map((c, i) =>
    i === crumbs.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${esc(c.url)}">${esc(c.name)}</a>`
  ).join(' <span class="sep">›</span> ');

  const scheduleTxt = [t.horaire_depart_raw ? `Départs : ${t.horaire_depart_raw}` : '', t.horaire_arrivee_raw ? `Arrivées : ${t.horaire_arrivee_raw}` : '']
    .filter(Boolean).join(' · ');

  // [FIX 2026-08-31] `escales` était déjà sélectionné mais jamais affiché — pour
  // les lignes urbaines AFTU (TATA), c'est l'itinéraire rue par rue complet
  // (pas juste les villes intermédiaires comme pour les lignes intercités),
  // l'info la plus utile de la fiche. Affiché comme liste ordonnée si présent.
  const escalesList = (t.escales || '').split('|').map(s => s.trim()).filter(Boolean);
  const itineraryHtml = escalesList.length > 1
    ? `<div class="itin"><h2>🗺️ Itinéraire</h2><ol>${escalesList.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>`
    : '';

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}${priceTxt ? ' — ' + priceTxt : ''} · NEXUS Market Sénégal</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="NEXUS Market Sénégal">
<meta property="og:locale" content="fr_SN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:image" content="${esc(img)}">
<script type="application/ld+json">${graph}</script>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#1F2937;line-height:1.6}h1{font-size:1.5rem;margin:.4rem 0}.cat{color:#1d4ed8;font-weight:700;font-size:.95rem;margin-bottom:.5rem}.meta{color:#6B7280;font-size:.9rem;margin:.3rem 0}.price{color:#00853E;font-size:1.5rem;font-weight:800;margin:.6rem 0}.crumb{font-size:.8rem;color:#6B7280;margin-bottom:1rem}.crumb a{color:#1d4ed8;text-decoration:none}.crumb .sep{margin:0 4px}.cta{display:inline-block;background:#00853E;color:#fff;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:1.2rem}.foot{color:#9CA3AF;font-size:.8rem;margin-top:2.2rem}.itin{margin:1.1rem 0}.itin h2{font-size:1rem;margin:0 0 .5rem}.itin ol{margin:0;padding-left:1.3rem;color:#374151;font-size:.88rem;line-height:1.9}</style>
</head><body>
<nav class="crumb">${crumbHtml}</nav>
<h1>🚌 ${esc(title)}</h1>
<div class="cat">${esc(vehicleLabel)}${t.origin_gare ? ' · Départ : ' + esc(t.origin_gare) : ''}</div>
${priceTxt ? `<div class="price">${esc(priceTxt)}</div>` : ''}
<p>${esc(desc)}</p>
${scheduleTxt ? `<div class="meta">🕐 ${esc(scheduleTxt)}</div>` : ''}
${itineraryHtml}
${t.price_luggage ? `<div class="meta">🧳 Bagages : ${esc(t.price_luggage)}</div>` : ''}
${t.notes ? `<div class="meta">${esc(t.notes)}</div>` : ''}
${t.phone ? `<div class="meta">📞 ${esc(t.phone)}</div>` : ''}
<a class="cta" href="${esc(appUrl)}">Voir toutes les lignes sur NEXUS Market →</a>
<p class="foot">NEXUS Market — Annuaire des transporteurs réguliers au Sénégal (bus, car, ferry, VTC) · Informations publiques, à confirmer directement avec l'opérateur.</p>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
  });
}
