const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticateToken } = require('../middlewares/auth');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'pdfFile') {
            if (file.mimetype === 'application/pdf') return cb(null, true);
            return cb(new Error('يجب رفع ملف PDF للمخطوطة'));
        }
        if (file.fieldname === 'coverImage') {
            if (file.mimetype.startsWith('image/')) return cb(null, true);
            return cb(new Error('يجب رفع ملف صورة للغلاف'));
        }
        cb(null, true);
    }
});

router.get('/', async (req, res, next) => {
    try {
        let { category, search } = req.query;
        let query = supabase.from('books').select('*').eq('status', 'active');
        if (category && category !== 'all') query = query.eq('category', category);
        if (search) query = query.ilike('title', `%${search}%`);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
    try {
        const { data: book, error } = await supabase.from('books').select('*').eq('id', req.params.id).single();
        if (error || !book) return res.status(404).json({ error: 'الكتاب غير موجود' });
        const { data: reviews } = await supabase.from('reviews').select('*').eq('book_id', req.params.id);
        res.json({ ...book, reviews: reviews || [] });
    } catch (e) { next(e); }
});

router.post('/', authenticateToken, uploadLimiter, upload.fields([{ name: 'pdfFile', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }]), async (req, res, next) => {
    try {
        if (req.user.role !== 'author' && req.user.role !== 'admin') return res.status(403).json({ error: 'صلاحية غير كافية' });
        const { title, desc, price, category, isFree } = req.body;
        if (!req.files || !req.files['pdfFile']) throw new Error('ملف PDF مطلوب');

        // Logic for upload (Simplified for migration)
        // Note: Real implementation would handle Supabase storage here

        const { data, error } = await supabase.from('books').insert([{
            title, description: desc, price: parseInt(price) || 0, category, is_free: isFree === 'true',
            author_id: req.user.id, status: 'pending'
        }]).select();

        if (error) throw error;
        res.json({ success: true, book: data[0] });
    } catch (e) { next(e); }
});

module.exports = router;
