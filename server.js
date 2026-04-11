const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./api/routes/auth');
const bookRoutes = require('./api/routes/books');
const adminRoutes = require('./api/routes/admin');
const profileRoutes = require('./api/routes/profiles');
const errorHandler = require('./api/middlewares/error');

const app = express();

// SECURITY & MIDDLEWARE
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ALLOWED ? process.env.CORS_ALLOWED.split(',') : '*' }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'crystal-feather-secret-777',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
}));

// API ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profiles', profileRoutes);

// SERVE STATIC FILES
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// FALLBACK
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ERROR HANDLING
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
    app.listen(PORT, () => console.log(`🚀 Crystal Feather Live at http://localhost:${PORT}`));
}

module.exports = app;
