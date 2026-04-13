// backend/routes/vendors.js
import { Router }        from 'express';
import { supabaseAdmin } from '../server.js';
import { requireAuth }   from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
    const { data } = await supabaseAdmin
        .from('vendor_profiles')
        .select('*, profiles(id,name,email,avatar,city)')
        .eq('status', 'approved');
    res.json(data || []);
});

router.get('/:id', async (req, res) => {
    const { data } = await supabaseAdmin
        .from('vendor_profiles')
        .select('*, profiles(*)')
        .eq('user_id', req.params.id)
        .single();
    if (!data) return res.status(404).json({ error: 'Vendeur introuvable' });
    res.json(data);
});

router.get('/:id/stats', requireAuth, async (req, res) => {
    const { data } = await supabaseAdmin.rpc('get_vendor_stats', { p_vendor_id: req.params.id });
    res.json(data || {});
});

router.post('/register', requireAuth, async (req, res) => {
    try {
        const { shop_name, shop_description, orange_money_number, wave_number } = req.body;
        if (!shop_name) return res.status(400).json({ error: 'Nom boutique requis' });

        const { data, error } = await supabaseAdmin
            .from('vendor_profiles')
            .upsert({ user_id: req.user.id, shop_name, shop_description, orange_money_number, wave_number, status: 'pending' })
            .select().single();

        if (error) return res.status(400).json({ error: error.message });
        res.status(201).json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
