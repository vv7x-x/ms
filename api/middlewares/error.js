module.exports = (err, req, res, next) => {
    console.error('[ERROR]', err && err.stack ? err.stack : err);
    const status = err.status || 500;
    const message = err.message || 'حدث خطأ داخلي، حاول لاحقاً';
    res.status(status).json({ error: message });
};
