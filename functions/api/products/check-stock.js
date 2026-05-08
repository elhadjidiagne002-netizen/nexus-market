import { CORS, options, json, err, supabase } from '';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const u = new URL(request.url);
    const ids = u.searchParams.get('ids');
    if (!ids) return err('ids requis', 400);
    const sb = supabase(env);
    const idList = ids.split(',').filter(Boolean);
    const data = await sb.from('products').select('id,stock,name', `id=in.(${idList.join(',')})`);
    const result = {};
    (data || []).forEach(p => { result[p.id] = { stock: p.stock, name: p.name, available: p.stock > 0 }; });
    return json(result);
  } catch (e) { return err(e.message, 500); }
}





