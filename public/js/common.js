// CRYSTAL FEATHER - COMMON UTILITIES V1.4 (CLEAN URI EDITION)
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// SECURE LOGOUT (CLEANSE BOTH DOMAINS)
async function logout() {
    localStorage.clear(); // Wipe everything
    await fetch('/api/auth/logout');
    showToast('تم تسجيل الخروج بنجاح في الأمان.. يرجى العودة في وقت لاحق');
    setTimeout(() => window.location.href = 'login', 1500);
}

// ROBUST IDENTITY VERIFIER
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) return { error: 'No Token Found' };
    try {
        const res = await fetch('/api/auth/me', { 
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            return { error: 'Auth Expired' };
        }
        return await res.json(); 
    } catch (e) {
        return { error: 'Network Error' };
    }
}

// HELPER FOR SECURE DATA FETCHES
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}
