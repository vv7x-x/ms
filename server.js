const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const validator = require('validator');

const app = express();

// helper to wrap async route handlers and forward errors
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- Validation middlewares ---
function validateRegister(req, res, next) {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'بيانات ناقصة' });
    if (!validator.isLength(username, { min: 3, max: 30 })) return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون بين 3 و30 حرفاً' });
    if (!validator.isLength(password, { min: 8 })) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
    next();
}

function validateLogin(req, res, next) {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'بيانات ناقصة لتسجيل الدخول' });
    next();
}

function validateProfileUpdate(req, res, next) {
    const { username, bio } = req.body;
    if (username && !validator.isLength(username, { min: 3, max: 30 })) return res.status(400).json({ error: 'اسم المستخدم غير صالح' });
    if (bio && !validator.isLength(bio, { max: 500 })) return res.status(400).json({ error: 'السيرة الذاتية طويلة جداً' });
    next();
}

function validateLibraryAdd(req, res, next) {
    const { bookId, type } = req.body;
    if (!bookId) return res.status(400).json({ error: 'معرّف الكتاب مطلوب' });
    if (type && !['download', 'purchase'].includes(type)) return res.status(400).json({ error: 'نوع الاستحواذ غير صالح' });
    next();
}

function validateBookFields(req, res, next) {
    const { title, price, category } = req.body;
    if (!title || !validator.isLength(title, { min: 2 })) return res.status(400).json({ error: 'العنوان مطلوب وطويل بما يكفي' });
    if (price && !validator.isInt(price.toString(), { min: 0 })) return res.status(400).json({ error: 'السعر غير صالح' });
    if (category && !validator.isLength(category, { min: 2 })) return res.status(400).json({ error: 'التصنيف غير صالح' });
    next();
}

// REAL-WORLD PHYSICAL DIRECTORY SYNC
const uploadDirs = ['uploads/books', 'uploads/covers'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
} else {
    console.warn('Supabase not configured (SUPABASE_URL/KEY missing). API DB routes will fail until configured.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'jwt-secret-999';

// MIDDLEWARE
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ALLOWED ? process.env.CORS_ALLOWED.split(',') : '*' }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'crystal-feather-secret-777',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// 🛡️ Clean URI Middleware
// Protect access to admin.html: require admin session/JWT
app.use((req, res, next) => {
    if (req.path === '/admin.html' || req.path === '/admin') {
        const sessionToken = req.session && req.session.user ? req.session.user.token : null;
        const headerToken = req.headers['authorization'] ? req.headers['authorization'].split(' ')[1] : null;
        const token = headerToken || sessionToken;
        if (!token) return res.redirect('/admin-login.html');
        try {
            const user = jwt.verify(token, JWT_SECRET);
            if (user && user.role === 'admin') return next();
            return res.status(403).send('Forbidden');
        } catch (e) {
            return res.redirect('/admin-login.html');
        }
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🧼 NO-CACHE PROTOCOL (Dev-Only Safety)
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
});

// RATE LIMITERS
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'محاولات كثيرة، حاول لاحقاً' } });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'محاولات رفع كثيرة، حاول لاحقاً' } });

app.use('/api/auth', authLimiter);
app.use('/api/books', uploadLimiter);

// STORAGE CONFIG: use memory storage and upload to Supabase Storage (with local fallback)
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'pdfFile') {
        if (file.mimetype === 'application/pdf') return cb(null, true);
        return cb(new Error('Only PDF files are allowed for manuscripts'));
    }
    if (file.fieldname === 'coverImage') {
        if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
        return cb(new Error('Only image files are allowed for cover images'));
    }
    cb(new Error('Unexpected file field'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// 🔐 JWT AUTH MIDDLEWARE
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const sessionToken = req.session && req.session.user ? req.session.user.token : null;
    const finalToken = token || sessionToken;

    if (!finalToken) {
        console.warn(`[AUTH] Refused access to ${req.path} - No token provided.`);
        return res.status(401).json({ error: 'الرجاء تسجيل الدخول' });
    }

    jwt.verify(finalToken, JWT_SECRET, (err, user) => {
        if (err) {
            console.error(`[AUTH] JWT Verify Failed for ${req.path}:`, err.message);
            return res.status(403).json({ error: 'جلسة التوثيق منتهية أو غير صالحة' });
        }
        req.user = user;
        next();
    });
}

// 👤 AUTH ROUTES
app.post('/api/auth/register', validateRegister, asyncHandler(async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'بيانات ناقصة' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const { data: profile, error } = await supabase.from('profiles').insert([
        { username, password_hash: hashedPassword, role: role || 'reader', status: 'active', is_verified: false }
    ]).select();

    if (error) return res.status(500).json({ error: 'عذراً، هذا الاسم مستخدم بالفعل' });
    res.json({ success: true, user: profile[0] });
}));

app.post('/api/auth/login', validateLogin, asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const { data: user, error } = await supabase.from('profiles').select('*').eq('username', username).single();

    if (error || !user) return res.status(401).json({ error: 'خطأ في اسم المستخدم أو كلمة المرور' });
    if (user.status === 'blocked') return res.status(403).json({ error: 'عذراً، هذا الحساب محظور حالياً' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'خطأ في كلمة المرور' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    req.session.user = { id: user.id, username: user.username, role: user.role, token };
    
    res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
}));

// Admin login: set session token for admin when correct password provided
app.post('/admin/login', asyncHandler(async (req, res) => {
    const { password } = req.body;
    const adminPass = process.env.ADMIN_PASSWORD || 'admin';
    if (!password) return res.status(400).json({ error: 'Password required' });
    if (password !== adminPass) return res.status(401).json({ error: 'Invalid password' });

    const token = jwt.sign({ username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
    req.session.user = { id: 'admin', username: 'admin', role: 'admin', token };
    res.json({ success: true });
}));

app.get('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

// 🎨 PROFILES
app.get('/api/profiles/:userId', async (req, res) => {
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
});

app.put('/api/profiles', authenticateToken, validateProfileUpdate, asyncHandler(async (req, res) => {
    const { username, bio, profileImage } = req.body;
    const { data, error } = await supabase.from('profiles')
        .update({ username, bio, profile_image: profileImage })
        .eq('id', req.user.id)
        .select();

    if (error) return res.status(500).json({ error: 'فشل التحديث' });
    res.json({ success: true, profile: data[0] });
}));

// 📚 BOOKS
app.get('/api/books', async (req, res) => {
    let { category, search } = req.query;
    let query = supabase.from('books').select('*').eq('status', 'active');
    
    if (category && category !== 'all') query = query.eq('category', category);
    if (search) query = query.ilike('title', `%${search}%`);
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.get('/api/books/:id', async (req, res) => {
    const { data: book } = await supabase.from('books').select('*').eq('id', req.params.id).single();
    if (!book) return res.status(404).json({ error: 'الكتاب غير موجود' });
    
    const { data: reviews } = await supabase.from('reviews').select('*').eq('book_id', req.params.id);
    res.json({ ...book, reviews: reviews || [] });
});

const uploadMiddleware = upload.fields([
    { name: 'pdfFile', maxCount: 1 }, 
    { name: 'coverImage', maxCount: 1 }
]);

app.post('/api/books', authenticateToken, (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.error('[MULTER ERROR] Field Mismatch:', err.stack);
            return res.status(400).json({ error: `خطأ في تحميل الحقول: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ error: 'خطأ غير متوقع أثناء الرفع' });
        }
        next();
    });
}, validateBookFields, asyncHandler(async (req, res) => {
    if (req.user.role !== 'author' && req.user.role !== 'admin') return res.status(403).json({ error: 'يجب أن تكون مؤلفاً للنشر' });
    const { title, desc, price, category, isFree } = req.body;

    // ensure pdf file was provided
    if (!req.files || !req.files['pdfFile'] || !req.files['pdfFile'][0]) return res.status(400).json({ error: 'يجب رفع المخطوطة بملف PDF' });

    // upload files: prefer Supabase Storage, fallback to local disk
    let pdfPath = null;
    let coverPath = '/assets/books.png';

    // handle PDF
    const pdfFile = req.files['pdfFile'] ? req.files['pdfFile'][0] : null;
    if (pdfFile) {
        const safeName = Date.now() + '-' + pdfFile.originalname.replace(/\s+/g, '_');
        if (supabase) {
            const bucket = 'books';
            const filePath = safeName;
            const { data: upData, error: upErr } = await supabase.storage.from(bucket).upload(filePath, pdfFile.buffer, { contentType: pdfFile.mimetype, upsert: false });
            if (upErr) throw upErr;
            const { data: urlData, error: urlErr } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60 * 60);
            if (urlErr) throw urlErr;
            pdfPath = urlData.signedUrl;
        } else {
            const dest = path.join('uploads', 'books', safeName);
            fs.writeFileSync(dest, pdfFile.buffer);
            pdfPath = `/uploads/books/${safeName}`;
        }
    }

    // handle cover image if provided
    const coverFile = req.files['coverImage'] ? req.files['coverImage'][0] : null;
    if (coverFile) {
        const safeName = Date.now() + '-' + coverFile.originalname.replace(/\s+/g, '_');
        if (supabase) {
            const bucket = 'covers';
            const filePath = safeName;
            const { data: upData, error: upErr } = await supabase.storage.from(bucket).upload(filePath, coverFile.buffer, { contentType: coverFile.mimetype, upsert: false });
            if (upErr) throw upErr;
            const { data: urlData, error: urlErr } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60 * 60);
            if (urlErr) throw urlErr;
            coverPath = urlData.signedUrl;
        } else {
            const dest = path.join('uploads', 'covers', safeName);
            fs.writeFileSync(dest, coverFile.buffer);
            coverPath = `/uploads/covers/${safeName}`;
        }
    }

    const { data, error } = await supabase.from('books').insert([{ 
        title, description: desc, price: parseInt(price) || 0, category, is_free: isFree === 'true', 
        pdf_url: pdfPath, cover_image: coverPath, author_id: req.user.id, status: 'active' 
    }]).select();

    if (error) return res.status(500).json({ error: 'فشل حفظ المخطوطة في الأرشيف' });
    res.json({ success: true, book: data[0] });
}));

// CENTRAL ERROR HANDLER
app.use((err, req, res, next) => {
    console.error('[ERROR]', err && err.stack ? err.stack : err);
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    const status = err.status || 500;
    const message = err.message || 'حدث خطأ داخلي، حاول لاحقاً';
    res.status(status).json({ error: message });
});

// Wrap book POST handler to catch async errors via asyncHandler
// Replace the previous async handler with a wrapped one

// 📖 USER LIBRARY & DOWNLOADS
app.post('/api/library/add', authenticateToken, validateLibraryAdd, asyncHandler(async (req, res) => {
    const { bookId, type } = req.body;
    const { error: libError } = await supabase.from('user_library').upsert([{ 
        user_id: req.user.id, book_id: bookId, acquisition_type: type 
    }]);

    const column = type === 'purchase' ? 'purchases_count' : 'downloads_count';
    const { data: book } = await supabase.from('books').select(column).eq('id', bookId).single();
    if (book) {
        await supabase.from('books').update({ [column]: (book[column] || 0) + 1 }).eq('id', bookId);
    }

    if (libError) return res.status(500).json({ error: 'فشل الإضافة للمكتبة' });
    res.json({ success: true });
}));

// 👑 ADMIN API
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

    const { count: totalBooks } = await supabase.from('books').select('*', { count: 'exact', head: true });
    const { count: pendingBooks } = await supabase.from('books').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    
    res.json({ totalBooks: totalBooks || 0, pendingBooks: pendingBooks || 0, totalUsers: totalUsers || 0, revenue: 0 });
});

app.get('/api/admin/userlist', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Denied' });
    const { data: users } = await supabase.from('profiles').select('*');
    res.json(users || []);
});

app.put('/api/admin/users/:userId/verify', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Denied' });
    const { is_verified } = req.body;
    await supabase.from('profiles').update({ is_verified, verified_at: is_verified ? new Date().toISOString() : null }).eq('id', req.params.userId);
    res.json({ success: true });
});

app.delete('/api/admin/users/:userId', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Denied' });
    await supabase.from('profiles').update({ status: 'blocked' }).eq('id', req.params.userId);
    res.json({ success: true });
});

app.put('/api/admin/books/:id/status', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Denied' });
    const { status } = req.body;
    await supabase.from('books').update({ status }).eq('id', req.params.id);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Crystal Feather Live at http://localhost:${PORT}`));
