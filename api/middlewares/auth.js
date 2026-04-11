const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'jwt-secret-999';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const sessionToken = req.session && req.session.user ? req.session.user.token : null;
    const finalToken = token || sessionToken;

    if (!finalToken) return res.status(401).json({ error: 'يرجى تسجيل الدخول للوصول' });

    try {
        const user = jwt.verify(finalToken, JWT_SECRET);
        req.user = user;
        next();
    } catch (e) {
        return res.status(403).json({ error: 'انتهت صلاحية الجلسة' });
    }
}

module.exports = { authenticateToken, JWT_SECRET };
