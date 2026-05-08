// backend/routes/orders.js
import { Router }        from 'express';
import { supabaseAdmin } from '../server.js';
import { requireAuth }   from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const { page=1, limit=20, status } = req.query;
        const from = (page-1)*limit;
        const to   = from + Number(limit) - 1;

        let q = supabaseAdmin.from('orders')
            .select('*, order_items(*)', { count: 'exact' });

        if (req.user.role === 'buyer')  q = q.eq('buyer_id',  req.user.id);
        if (req.user.role === 'vendor') q = q.eq('vendor_id', req.user.id);
        if (status) q = q.eq('status', status);

        q = q.order('created_at', { ascending: false }).range(from, to);
        const { data, error, count } = await q;
        if (error) throw error;
        res.json({ data, total: count, page: Number(page) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('orders')
            .select('*, order_items(*)')
            .eq('id', req.params.id)
            .single();

        if (!data) return res.status(404).json({ error: 'Commande introuvable' });
        if (data.buyer_id !== req.user.id && data.vendor_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { items = [], ...orderData } = req.body;

        const productIds = items.map(i => i.product_id).filter(Boolean);
        let products = [];
        if (productIds.length > 0) {
            const { data } = await supabaseAdmin
                .from('products').select('id,price,name,stock,vendor_id').in('id', productIds);
            products = data || [];
        }

        const productMap = Object.fromEntries(products.map(p => [p.id, p]));
        let subtotal = 0;

        const orderItems = items.map(item => {
            const p = productMap[item.product_id] || item;
            const unitPrice = p.price || item.price || 0;
            const qty       = item.quantity || 1;
            const lineTotal = unitPrice * qty;
            subtotal += lineTotal;
            return {
                product_id: item.product_id,
                name: p.name || item.name,
                price: unitPrice,
                quantity: qty,
                subtotal: lineTotal,
                image_url: item.image_url
            };
        });

        const shippingCost = Number(orderData.shipping_cost) || 0;
        const discount     = Number(orderData.discount) || 0;
        const total        = subtotal + shippingCost - discount;

        const vendorId = orderData.vendor_id || (products[0]?.vendor_id);

        const { data: order, error } = await supabaseAdmin
            .from('orders')
            .insert({
                ...orderData,
                buyer_id:    req.user.id,
                buyer_name:  req.user.name,
                buyer_email: req.user.email,
                vendor_id:   vendorId,
                subtotal,
                total,
                products:    orderItems,
                date:        new Date().toISOString()
            })
            .select().single();

        if (error) throw error;

        if (orderItems.length > 0) {
            await supabaseAdmin.from('order_items')
                .insert(orderItems.map(i => ({ ...i, order_id: order.id })));
        }

        res.status(201).json(order);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.patch('/:id/status', requireAuth, async (req, res) => {
    try {
        const { status, tracking_number, cancel_reason } = req.body;
        const { data: existing } = await supabaseAdmin
            .from('orders').select('vendor_id,buyer_id').eq('id', req.params.id).single();

        if (!existing) return res.status(404).json({ error: 'Introuvable' });
        if (existing.vendor_id !== req.user.id && existing.buyer_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }

        const updates = { status };
        if (tracking_number) updates.tracking_number = tracking_number;
        if (status === 'shipped')   updates.shipped_at   = new Date().toISOString();
        if (status === 'delivered') updates.delivered_at = new Date().toISOString();
        if (status === 'cancelled') { updates.cancelled_at = new Date().toISOString(); updates.cancel_reason = cancel_reason; }

        const { data, error } = await supabaseAdmin
            .from('orders').update(updates).eq('id', req.params.id).select().single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
