// ═══════════════════════════════════════════════════════════════════════════
// backend/routes/products.js
// ═══════════════════════════════════════════════════════════════════════════
import { Router }        from 'express';
import { supabaseAdmin } from '../server.js';
import { requireAuth, requireVendor, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/products
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { page=1, limit=24, category, q, vendor_id, featured, min_price, max_price } = req.query;
        const from = (page-1) * limit;
        const to   = from + Number(limit) - 1;

        let query = supabaseAdmin
            .from('products')
            .select('*', { count: 'exact' })
            .eq('active', true)
            .eq('status', 'active');

        if (category)  query = query.eq('category', category);
        if (vendor_id) query = query.eq('vendor_id', vendor_id);
        if (featured)  query = query.eq('featured', true);
        if (min_price) query = query.gte('price', min_price);
        if (max_price) query = query.lte('price', max_price);
        if (q)         query = query.ilike('name', `%${q}%`);

        query = query.order('created_at', { ascending: false }).range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        res.json({ data, total: count, page: Number(page), limit: Number(limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('products')
            .select('*, reviews(id,rating,buyer_name,body,created_at,verified)')
            .eq('id', req.params.id)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Produit introuvable' });

        // Incrémenter vue
        await supabaseAdmin.from('products')
            .update({ view_count: (data.view_count || 0) + 1 })
            .eq('id', req.params.id);

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/products
router.post('/', requireAuth, requireVendor, async (req, res) => {
    try {
        const product = {
            ...req.body,
            vendor_id:   req.user.id,
            vendor_name: req.user.name,
            vendor:      req.user.id,
            status:      'active',
            active:      true
        };
        delete product.id; // laisser Postgres générer l'UUID

        const { data, error } = await supabaseAdmin
            .from('products')
            .insert(product)
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/products/:id
router.put('/:id', requireAuth, requireVendor, async (req, res) => {
    try {
        // Vérifier propriété
        const { data: existing } = await supabaseAdmin
            .from('products').select('vendor_id').eq('id', req.params.id).single();

        if (!existing) return res.status(404).json({ error: 'Produit introuvable' });
        if (existing.vendor_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }

        const { id, vendor_id, created_at, ...updates } = req.body;

        const { data, error } = await supabaseAdmin
            .from('products')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/products/:id
router.delete('/:id', requireAuth, requireVendor, async (req, res) => {
    try {
        const { data: existing } = await supabaseAdmin
            .from('products').select('vendor_id').eq('id', req.params.id).single();

        if (!existing) return res.status(404).json({ error: 'Produit introuvable' });
        if (existing.vendor_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }

        await supabaseAdmin.from('products').delete().eq('id', req.params.id);
        res.json({ message: 'Produit supprimé' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;


// ═══════════════════════════════════════════════════════════════════════════
// backend/routes/orders.js  (exporté séparément dans un vrai projet)
// ═══════════════════════════════════════════════════════════════════════════
import { Router as OrderRouter } from 'express';
import { requireAuth as _requireAuth, requireAdmin as _requireAdmin } from '../middleware/auth.js';

export const orderRouter = OrderRouter();

// GET /api/orders
orderRouter.get('/', _requireAuth, async (req, res) => {
    try {
        const { page=1, limit=20, status } = req.query;
        const from = (page-1)*limit;
        const to   = from + Number(limit) - 1;

        let q = supabaseAdmin.from('orders').select('*, order_items(*)', { count: 'exact' });

        if (req.user.role === 'buyer')  q = q.eq('buyer_id',  req.user.id);
        if (req.user.role === 'vendor') q = q.eq('vendor_id', req.user.id);
        if (status)                     q = q.eq('status', status);

        q = q.order('created_at', { ascending: false }).range(from, to);

        const { data, error, count } = await q;
        if (error) throw error;
        res.json({ data, total: count, page: Number(page) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/orders
orderRouter.post('/', _requireAuth, async (req, res) => {
    try {
        const { items, ...orderData } = req.body;

        // Calculer le total depuis les vrais prix DB
        const productIds = items.map(i => i.product_id);
        const { data: products } = await supabaseAdmin
            .from('products').select('id,price,name,stock,vendor_id').in('id', productIds);

        if (!products || products.length === 0) {
            return res.status(400).json({ error: 'Produits introuvables' });
        }

        const productMap = Object.fromEntries(products.map(p => [p.id, p]));
        let   subtotal   = 0;

        const orderItems = items.map(item => {
            const p = productMap[item.product_id];
            if (!p) throw new Error(`Produit ${item.product_id} introuvable`);
            if (p.stock < item.quantity) throw new Error(`Stock insuffisant pour "${p.name}"`);
            const lineTotal = p.price * item.quantity;
            subtotal += lineTotal;
            return { product_id: p.id, name: p.name, price: p.price, quantity: item.quantity, subtotal: lineTotal, image_url: item.image_url };
        });

        const shippingCost = orderData.shipping_cost || 0;
        const total        = subtotal + shippingCost - (orderData.discount || 0);

        // Insérer la commande
        const { data: order, error: oErr } = await supabaseAdmin
            .from('orders')
            .insert({
                ...orderData,
                buyer_id: req.user.id,
                buyer_name: req.user.name,
                buyer_email: req.user.email,
                vendor_id: products[0].vendor_id,     // commande mono-vendeur
                subtotal, total,
                products: orderItems                   // snapshot JSONB
            })
            .select().single();

        if (oErr) throw oErr;

        // Insérer les lignes
        await supabaseAdmin.from('order_items')
            .insert(orderItems.map(i => ({ ...i, order_id: order.id })));

        res.status(201).json(order);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PATCH /api/orders/:id/status
orderRouter.patch('/:id/status', _requireAuth, async (req, res) => {
    try {
        const { status, tracking_number, cancel_reason } = req.body;
        const VALID = ['pending','confirmed','processing','shipped','delivered','cancelled','refunded'];
        if (!VALID.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

        const { data: existing } = await supabaseAdmin
            .from('orders').select('vendor_id,buyer_id,status').eq('id', req.params.id).single();

        if (!existing) return res.status(404).json({ error: 'Commande introuvable' });

        const isVendor = req.user.id === existing.vendor_id;
        const isBuyer  = req.user.id === existing.buyer_id;
        const isAdmin  = req.user.role === 'admin';

        if (!isVendor && !isBuyer && !isAdmin) {
            return res.status(403).json({ error: 'Non autorisé' });
        }

        const updates = { status };
        if (tracking_number) updates.tracking_number = tracking_number;
        if (status === 'shipped')   updates.shipped_at   = new Date().toISOString();
        if (status === 'delivered') updates.delivered_at = new Date().toISOString();
        if (status === 'cancelled') {
            updates.cancelled_at  = new Date().toISOString();
            updates.cancel_reason = cancel_reason;
        }

        const { data, error } = await supabaseAdmin
            .from('orders').update(updates).eq('id', req.params.id).select().single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
