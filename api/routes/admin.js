const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticateToken } = require('../middlewares/auth');

router.use(authenticateToken);
router.use((req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'غير مسموح' });
    next();
});

router.get('/stats', async (req, res, next) => {
    try {
        const { count: totalBooks } = await supabase.from('books').select('*', { count: 'exact', head: true });
        const { count: pendingBooks } = await supabase.from('books').select('*', { count: 'exact', head: true }).eq('status', 'pending');
        const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        res.json({ totalBooks: totalBooks || 0, pendingBooks: pendingBooks || 0, totalUsers: totalUsers || 0 });
    } catch (e) { next(e); }
});

router.get('/userlist', async (req, res, next) => {
    try {
        const { data: users } = await supabase.from('profiles').select('*');
        res.json(users || []);
    } catch (e) { next(e); }
});

router.put('/users/:userId/verify', async (req, res, next) => {
    try {
        const { is_verified } = req.body;
        await supabase.from('profiles').update({ is_verified, verified_at: is_verified ? new Date().toISOString() : null }).eq('id', req.params.userId);
        res.json({ success: true });
    } catch (e) { next(e); }
});

module.exports = router;
