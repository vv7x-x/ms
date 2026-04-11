const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticateToken } = require('../middlewares/auth');

router.get('/:userId', async (req, res, next) => {
    try {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', req.params.userId).single();
        if (!profile) return res.status(404).json({ error: 'الصفحة غير موجودة' });

        const { data: books } = await supabase.from('books').select('*').eq('author_id', req.params.userId);
        const { data: library } = await supabase.from('user_library').select('*, books(*)').eq('user_id', req.params.userId);

        res.json({
            ...profile,
            books: books || [],
            library: library || [],
            analytics: {
                totalWorks: books ? books.length : 0,
                librarySize: library ? library.length : 0,
                isVerified: profile.is_verified
            }
        });
    } catch (e) { next(e); }
});

router.put('/', authenticateToken, async (req, res, next) => {
    try {
        const { username, bio, profileImage } = req.body;
        const { data, error } = await supabase.from('profiles')
            .update({ username, bio, profile_image: profileImage })
            .eq('id', req.user.id)
            .select();

        if (error) throw error;
        res.json({ success: true, profile: data[0] });
    } catch (e) { next(e); }
});

module.exports = router;
