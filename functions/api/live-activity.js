// functions/api/live-activity.js — GET /api/live-activity
// Flux d'activité live public (bandeau défilant façon ticker TV) agrégeant
// 7 verticaux : coursier, dépannage, pro, élevage & terroir, location,
// immobilier, troc.
//
// [SEC] deliveries et rescue_requests sont protégés par RLS (propriétaire/
// prestataire/admin uniquement — adresses, téléphones). Cet endpoint tourne
// avec la clé service_role (bypasse la RLS) et NE RENVOIE JAMAIS les
// lignes brutes : uniquement un texte déjà composé, à la granularité
// quartier/zone (même niveau que les annonces Location/Immobilier déjà
// publiques), sans id, nom, téléphone ni coordonnées exactes.
//
// Public, sans authentification, cache Cloudflare 30s (réduit la charge DB
// pour un ticker qui rafraîchit toutes les ~60-90s côté client).
import { supabase, options, CORS } from './_lib/utils.js';

const ISSUE_LABELS = {
  breakdown: 'Panne moteur', flat_tire: 'Crevaison', battery: 'Batterie à plat',
  fuel: 'Panne d\'essence', lockout: 'Clé bloquée', tow: 'Remorquage', other: 'Dépannage',
};

function pick(n, arr) { return (arr || []).slice(0, n); }

async function safe(fn) { try { return await fn(); } catch (_) { return []; } }

export async function onRequestOptions() { return options(); }

export async function onRequestGet({ env }) {
  const sb = supabase(env);

  const [courier, rescue, pro, elevage, rental, realestate, troc] = await Promise.all([
    safe(async () => {
      const rows = await sb.from('deliveries').select('pickup_label,status',
        `status=in.(accepted,picked_up,in_transit)&order=created_at.desc&limit=6`);
      return pick(6, rows).filter(r => r.pickup_label).map(r => ({
        type: 'courier', text: `Livraison en cours depuis ${r.pickup_label}`,
      }));
    }),
    safe(async () => {
      const rows = await sb.from('rescue_requests').select('issue_type,location_zone,location_label,status',
        `status=in.(searching,accepted,en_route,arrived)&order=created_at.desc&limit=6`);
      return pick(6, rows).map(r => {
        const zone = r.location_zone || r.location_label;
        const label = ISSUE_LABELS[r.issue_type] || 'Dépannage';
        return { type: 'rescue', text: zone ? `${label} en cours à ${zone}` : `${label} en cours` };
      });
    }),
    safe(async () => {
      const rows = await sb.from('pros').select('profession,city',
        `status=eq.active&order=created_at.desc&limit=6`);
      return pick(6, rows).filter(r => r.profession).map(r => ({
        type: 'pro', text: `${r.profession} disponible${r.city ? ' à ' + r.city : ''}`,
      }));
    }),
    safe(async () => {
      const rows = await sb.from('products').select('name,animal_specs',
        `is_animal=eq.true&active=eq.true&order=created_at.desc&limit=6`);
      return pick(6, rows).filter(r => r.name).map(r => ({
        type: 'elevage', text: `Nouveau : ${r.name}`,
      }));
    }),
    safe(async () => {
      const rows = await sb.from('products').select('name,rental_specs',
        `is_rental=eq.true&active=eq.true&order=created_at.desc&limit=6`);
      return pick(6, rows).filter(r => r.name).map(r => {
        const region = r.rental_specs && r.rental_specs.region;
        return { type: 'rental', text: `En location : ${r.name}${region ? ' à ' + region : ''}` };
      });
    }),
    safe(async () => {
      const rows = await sb.from('products').select('name,realestate_specs',
        `is_realestate=eq.true&active=eq.true&order=created_at.desc&limit=6`);
      return pick(6, rows).filter(r => r.name).map(r => {
        const s = r.realestate_specs || {};
        const verbe = s.transaction === 'vente' ? 'À vendre' : 'À louer';
        return { type: 'realestate', text: `${verbe} : ${r.name}${s.region ? ' à ' + s.region : ''}` };
      });
    }),
    safe(async () => {
      const rows = await sb.from('troc_listings').select('title,city',
        `status=eq.active&order=created_at.desc&limit=6`);
      return pick(6, rows).filter(r => r.title).map(r => ({
        type: 'troc', text: `Proposé au troc : ${r.title}${r.city ? ' à ' + r.city : ''}`,
      }));
    }),
  ]);

  const items = [...courier, ...rescue, ...pro, ...elevage, ...rental, ...realestate, ...troc];

  return new Response(JSON.stringify(items), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
  });
}
