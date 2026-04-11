const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, authenticateToken } = require('../middlewares/auth');
const supabase = require('../config/supabase');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'محاولات كثيرة، حاول لاحقاً' }
});

router.post('/register', authLimiter, async (req, res, next) => {
    try {
        const { username, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 12);
        const { data, error } = await supabase.from('profiles').insert([
            { username, password_hash: hashedPassword, role: role || 'reader', status: 'active', is_verified: false }
        ]).select();
        if (error) throw new Error('عذراً، هذا الاسم مستخدم بالفعل');
        res.json({ success: true, user: data[0] });
    } catch (e) { next(e); }
});

router.post('/login', authLimiter, async (req, res, next) => {
    try {
        const { username, password } = req.body;
        const { data: user, error } = await supabase.from('profiles').select('*').eq('username', username).single();
        if (error || !user) return res.status(401).json({ error: 'خطأ في اسم المستخدم أو كلمة المرور' });
        if (user.status === 'blocked') return res.status(403).json({ error: 'عذراً، هذا الحساب محظور حالياً' });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'خطأ في كلمة المرور' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        req.session.user = { id: user.id, username: user.username, role: user.role, token };
        res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (e) { next(e); }
});

router.get('/me', authenticateToken, (req, res) => res.json(req.user));
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

module.exports = router;
