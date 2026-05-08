// backend/routes/admin.js
import { Router }        from 'express';
import { supabaseAdmin } from '../server.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', async (req, res) => {
    const { data } = await supabaseAdmin.rpc('get_admin_dashboard_stats');
    res.json(data || {});
});

router.get('/users', async (req, res) => {
    const { page=1, limit=20, role } = req.query;
    const from = (page-1)*limit, to = from+Number(limit)-1;
    let q = supabaseAdmin.from('profiles').select('*', { count: 'exact' });
    if (role) q = q.eq('role', role);
    const { data, count } = await q.order('created_at', { ascending: false }).range(from, to);
    res.json({ data, total: count });
});

router.patch('/vendors/:id/approve', async (req, res) => {
    try {
        const { status, admin_note } = req.body;
        const updates = { status, admin_note };
        if (status === 'approved') updates.approved_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin.from('vendor_profiles')
            .update(updates).eq('user_id', req.params.id).select().single();
        if (error) return res.status(400).json({ error: error.message });

        if (status === 'approved') {
            await supabaseAdmin.from('profiles').update({ role: 'vendor' }).eq('id', req.params.id);
        }
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/products/:id/moderate', async (req, res) => {
    const { status } = req.body;
    const { data, error } = await supabaseAdmin.from('products')
        .update({ status, active: status === 'active' }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
});

router.get('/orders', async (req, res) => {
    const { page=1, limit=20, status } = req.query;
    const from = (page-1)*limit, to = from+Number(limit)-1;
    let q = supabaseAdmin.from('orders').select('*', { count: 'exact' });
    if (status) q = q.eq('status', status);
    const { data, count } = await q.order('created_at', { ascending: false }).range(from, to);
    res.json({ data, total: count });
});

router.delete('/users/:id', async (req, res) => {
    try {
        await supabaseAdmin.auth.admin.deleteUser(req.params.id);
        res.json({ message: 'Utilisateur supprimé' });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
