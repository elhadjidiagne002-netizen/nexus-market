// functions/api/products/search.js — Feature 13 : Recherche avancée
// GET /api/products/search?q=&min_price=&max_price=&category=&location=&min_rating=&sort=&order=&page=&limit=&in_stock=
import { options, json, err } from '../_lib/utils.js';

export async function onRequestGet({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const url = new URL(request.url);
    const p   = url.searchParams;

    const q         = p.get('q')?.trim() || '';
    const minPrice  = p.get('min_price');
    const maxPrice  = p.get('max_price');
    const category  = p.get('category');
    const location  = p.get('location');
    const minRating = p.get('min_rating');
    const inStock   = p.get('in_stock') === '1';
    const vendorId  = p.get('vendor_id');
    const sortBy    = ['price','rating','created_at','name','stock'].includes(p.get('sort')) ? p.get('sort') : 'created_at';
    const order     = p.get('order') === 'asc' ? 'asc' : 'desc';
    const page      = Math.max(1, parseInt(p.get('page') || '1'));
    const limit     = Math.min(100, Math.max(1, parseInt(p.get('limit') || '20')));
    const offset    = (page - 1) * limit;

    // Construire les filtres PostgREST
    const filters = ['status=eq.active'];
    if (q)         filters.push(`or=(name.ilike.*${encodeURIComponent(q)}*,description.ilike.*${encodeURIComponent(q)}*)`);
    if (minPrice)  filters.push(`price=gte.${parseFloat(minPrice)}`);
    if (maxPrice)  filters.push(`price=lte.${parseFloat(maxPrice)}`);
    if (category)  filters.push(`category_id=eq.${category}`);
    if (location)  filters.push(`location=ilike.*${encodeURIComponent(location)}*`);
    if (minRating) filters.push(`rating=gte.${parseFloat(minRating)}`);
    if (inStock)   filters.push('stock=gt.0');
    if (vendorId)  filters.push(`vendor_id=eq.${vendorId}`);

    const select = 'id,name,slug,description,price,compare_price,images,rating,rating_count,stock,location,tags,created_at,vendor_id,category_id';

    const SB_URL = env.SUPABASE_URL;
    const SB_KEY = env.SUPABASE_SERVICE_KEY;
    const endpoint = `${SB_URL}/rest/v1/products?select=${encodeURIComponent(select)}&${filters.join('&')}&order=${sortBy}.${order}&limit=${limit}&offset=${offset}`;

    const res = await fetch(endpoint, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=exact' },
    });

    if (!res.ok) return err('Recherche échouée', 500);
    const data  = await res.json();
    const total = parseInt(res.headers.get('content-range')?.split('/')[1] || '0');

    // Facettes dynamiques
    const prices = data.map(d => d.price).filter(Boolean);

    return new Response(JSON.stringify({
      results: data,
      facets: {
        locations:   [...new Set(data.map(d => d.location).filter(Boolean))].slice(0, 10),
        price_range: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
      },
      query:      { q, filters: { minPrice, maxPrice, category, location, minRating, inStock } },
      pagination: { page, limit, total, pages: Math.ceil(total / limit), has_more: offset + data.length < total },
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=30' },
    });
  } catch (e) {
    return err(e.message, 500);
  }
}
