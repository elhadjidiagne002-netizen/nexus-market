// functions/api/shipping-quote.js → /api/shipping-quote
// [REVENU PASSIF #16] Devis de livraison avec MARGE intégrée (markup logistique).
// Le frontend affiche un « frais de service » fixe et prévisible ; la marge NEXUS
// est ajoutée silencieusement au coût transporteur. 100% passif.
//
//   GET  /api/shipping-quote?city=Dakar
//   POST /api/shipping-quote   { city, weightKg?, express? }
//   → { zone, carrier_price, margin, total, currency: "XOF" }
//
// Mode actuel : grille de zones intégrée (utilisable immédiatement). Pour brancher
// un vrai transporteur (Yassir, DHL SN, Senpost), implémenter carrierQuote() et
// définir les variables : SHIPPING_API_URL, SHIPPING_API_KEY.
// Marge configurable : SHIPPING_MARGIN_FCFA (défaut 300) ou par zone ci-dessous.
import { json, err, corsOptions } from './_lib/response.js';

// Grille de repli (coût transporteur estimé + marge par zone), en FCFA.
const ZONES = [
  { match: /dakar(?!.*(pikine|gu[ée]diawaye|banlieue))/i, zone: 'Dakar intra-muros', carrier: 1200, margin: 300 },
  { match: /pikine|gu[ée]diawaye|rufisque|banlieue|keur massar/i, zone: 'Banlieue dakaroise', carrier: 1800, margin: 400 },
  { match: /thi[èe]s|mbour|saint|touba|kaolack|ziguinchor|diourbel|louga|tamba|kolda/i, zone: 'Régions', carrier: 3000, margin: 700 },
];
const DEFAULT_ZONE = { zone: 'Autres régions', carrier: 3500, margin: 800 };

function resolveZone(city) {
  const c = String(city || '').trim();
  return ZONES.find(z => z.match.test(c)) || DEFAULT_ZONE;
}

// [TODO] Brancher un vrai transporteur ici. Retourner le coût brut (XOF) ou null.
async function carrierQuote(env, { city, weightKg, express }) {
  if (!env.SHIPPING_API_URL || !env.SHIPPING_API_KEY) return null; // pas configuré → grille de repli
  try {
    const r = await fetch(env.SHIPPING_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.SHIPPING_API_KEY}` },
      body: JSON.stringify({ city, weight_kg: weightKg || 1, express: !!express }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    // Adapter selon la réponse du transporteur :
    return Number(data.price ?? data.amount ?? data.cost) || null;
  } catch { return null; }
}

async function quote(env, params) {
  const z = resolveZone(params.city);
  const apiPrice = await carrierQuote(env, params);
  const carrier = apiPrice != null ? Math.round(apiPrice) : z.carrier;
  const margin = Number(env.SHIPPING_MARGIN_FCFA) > 0 ? parseInt(env.SHIPPING_MARGIN_FCFA, 10) : z.margin;
  const expressSurcharge = params.express ? 1000 : 0;
  return {
    zone: z.zone,
    carrier_price: carrier,
    margin: margin + expressSurcharge,
    total: carrier + margin + expressSurcharge, // prix affiché à l'acheteur
    currency: 'XOF',
    source: apiPrice != null ? 'carrier_api' : 'grid',
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return corsOptions();

  try {
    let params = {};
    if (request.method === 'GET') {
      const u = new URL(request.url);
      params = { city: u.searchParams.get('city'), weightKg: parseFloat(u.searchParams.get('weightKg') || '1'), express: u.searchParams.get('express') === '1' };
    } else if (request.method === 'POST') {
      params = await request.json().catch(() => ({}));
    } else {
      return err('GET ou POST uniquement', 405);
    }
    if (!params.city) return err('Paramètre "city" requis', 400);
    return json(await quote(env, params), 200);
  } catch (e) {
    return err(e.message || 'Erreur devis', 500);
  }
}
