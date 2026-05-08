// backend/routes/analytics.js
import { Router }        from 'express';
import { supabaseAdmin } from '../server.js';
import { optionalAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// POST /api/analytics/event — enregistrement événement (public)
router.post('/event', optionalAuth, async (req, res) => {
    try {
        const { category, action, label, value, page } = req.body;
        const ip     = req.ip || '';
        const ipHash = Buffer.from(ip).toString('base64').slice(0, 16);

        await supabaseAdmin.from('analytics_events').insert({
            user_id:    req.user?.id || null,
            category, action, label, value, page,
            ip_hash:    ipHash,
            user_agent: req.headers['user-agent']?.slice(0, 200)
        });
        res.status(204).end();
    } catch {
        res.status(204).end();  // silencieux — on ne bloque pas l'app pour ça
    }
});

// GET /api/analytics/stats — statistiques admin
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const since = new Date(Date.now() - days * 86400000).toISOString();

        const { data: events } = await supabaseAdmin
            .from('analytics_events')
            .select('category, action, label, created_at')
            .gte('created_at', since);

        const byDay = {}, byCategory = {}, byAction = {};
        (events || []).forEach(e => {
            const day = e.created_at.slice(0, 10);
            byDay[day]             = (byDay[day] || 0) + 1;
            byCategory[e.category] = (byCategory[e.category] || 0) + 1;
            byAction[e.action]     = (byAction[e.action] || 0) + 1;
        });

        res.json({ total: events?.length || 0, byDay, byCategory, byAction, days: Number(days) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
