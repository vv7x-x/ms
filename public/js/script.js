// CRYSTAL FEATHER - FRONTEND ENGINE V2.1
let cart = JSON.parse(localStorage.getItem('cart') || '[]');

// RELIABLE IMAGE PATH RESOLVER
function fixImagePath(path) {
    if (!path) return 'assets/books.png';
    if (path === 'books.png') return 'assets/books.png';
    // If it's a relative path from the server
    if (path.startsWith('/uploads')) return path; 
    return path;
}

async function loadBooks(category = 'all', search = '') {
    const grid = document.getElementById('newBooks');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loading-shimmer" style="text-align:center; color:var(--gold-main); padding: 100px;">يتم استدعاء المخطوطات من الأرشيف...</div>';
    
    try {
        const res = await fetch(`/api/books?category=${category}&search=${search}`);
        const books = await res.json();
        
        if (books.length === 0) {
            grid.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 100px;">لم نعثر على أي مؤلفات في هذا الرواق حالياً.</p>';
            return;
        }

        grid.innerHTML = books.map(book => `
            <div class="book-card" role="button" tabindex="0" aria-label="عرض تفاصيل ${escapeHtml(book.title)}" data-book-id="${book.id}" data-aos="fade-up">
                <div class="card-img-container">
                    <img src="${fixImagePath(book.cover_image)}" alt="${escapeHtml(book.title)}" loading="lazy">
                </div>
                <div class="book-info">
                    <h3>${escapeHtml(book.title)}</h3>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                        <span class="category-tag-mini">${escapeHtml(book.category || 'عام')}</span>
                        <span class="price-tag-mini">${book.is_free ? 'مجاني' : escapeHtml(String(book.price)) + ' ر.س'}</span>
                    </div>
                    <div style="margin-top:16px;">
                        ${book.is_free ? `
                            <button class="btn-primary" style="width:100%" data-action="download" data-id="${book.id}" onclick="event.stopPropagation(); handleDownload('${book.id}', '${book.pdf_url}')">تحميل المخطوطة</button>
                        ` : `
                            <button data-action="add" data-id="${book.id}" class="btn-primary" style="width:100%" onclick="event.stopPropagation(); addToCart('${book.id}', '${escapeHtml(book.title)}', ${book.price}, '${book.cover_image}')"><i class="fas fa-cart-shopping"></i> اقتناء</button>
                        `}
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        grid.innerHTML = '<p style="text-align:center; color:red;">خطأ في الاتصال بالأرشيف الملكي.</p>';
    }
}

// SECURE ACQUISITION (DOWNLOAD) TRACKER
async function handleDownload(bookId, pdfUrl) {
    const user = await checkAuth();
    if (user.error) return showToast('يرجى تسجيل الدخول لتسجيل المخطوطة في مكتبتك', 'error');

    showToast('جاري توثيق المخطوطة في مكتبتك الشخصية...');
    
    // Physical Record in DB
    await fetch('/api/library/add', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ bookId, type: 'download' })
    });

    setTimeout(() => window.open(pdfUrl, '_blank'), 1500);
}

// PERSISTENT CART LOGIC
function addToCart(id, title, price, image) {
    if (cart.find(i => i.id === id)) return showToast('هذا المجلد موجود بالفعل في سلة الشراء', 'error');
    cart.push({ id, title, price, image: fixImagePath(image) });
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartUI();
    showToast(`تمت إضافة "${title}" لسلة المقتنيات بنجاح`);
}

function updateCartUI() {
    const cartCountEl = document.getElementById('cart-count');
    if (cartCountEl) {
        cartCountEl.innerText = cart.length;
        cartCountEl.style.display = cart.length > 0 ? 'flex' : 'none';
    }
}

// SEARCH SYNC (debounced)
function debounce(fn, wait) {
    let t;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

const handleSearchInput = debounce((e) => {
    loadBooks('all', e.target.value);
}, 350);

document.getElementById('searchInput')?.addEventListener('input', handleSearchInput);

// Mobile menu toggle
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
mobileMenuBtn?.addEventListener('click', () => {
    const lists = document.querySelectorAll('.nav-section .nav-links');
    lists.forEach(l => l.classList.toggle('show'));
    const expanded = mobileMenuBtn.getAttribute('aria-expanded') === 'true';
    mobileMenuBtn.setAttribute('aria-expanded', (!expanded).toString());
});

// INITIALIZATION
window.onload = () => {
    AOS.init({ duration: 800, once: true });
    
    const urlParams = new URLSearchParams(window.location.search);
    loadBooks(urlParams.get('cat') || 'all');
    updateCartUI();
};

// small helper to escape HTML in templates
function escapeHtml(unsafe) {
    return String(unsafe).replace(/[&<>"]+/g, function(match) {
        switch(match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
        }
    });
}

// keyboard support: open modal on Enter/Space when focused on a .book-card
document.addEventListener('keydown', (e) => {
    const el = document.activeElement;
    if (!el) return;
    if (el.classList && el.classList.contains('book-card') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const id = el.getAttribute('data-book-id');
        if (id) showBookModal(id);
    }
});

// Book modal logic
async function showBookModal(bookId) {
    const modal = document.getElementById('bookModal');
    const titleEl = modal.querySelector('.modal-title');
    const descEl = modal.querySelector('.modal-desc');
    const coverEl = modal.querySelector('.modal-cover img');
    const actionsEl = modal.querySelector('.modal-actions');

    // fetch book details
    try {
        const res = await fetch(`/api/books/${bookId}`);
        const book = await res.json();
        titleEl.innerText = book.title || 'بدون عنوان';
        descEl.innerText = book.description || '';
        coverEl.src = fixImagePath(book.cover_image);
        actionsEl.innerHTML = '';

        if (book.is_free) {
            const btn = document.createElement('button');
            btn.className = 'btn-primary';
            btn.innerText = 'تحميل المخطوطة';
            btn.onclick = (e) => { e.stopPropagation(); handleDownload(book.id, book.pdf_url); };
            actionsEl.appendChild(btn);
        } else {
            const btn = document.createElement('button');
            btn.className = 'btn-primary';
            btn.innerHTML = '<i class="fas fa-cart-shopping"></i> اقتناء';
            btn.onclick = (e) => { e.stopPropagation(); addToCart(book.id, book.title, book.price, book.cover_image); };
            actionsEl.appendChild(btn);
        }

        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
    } catch (e) {
        showToast('تعذّر تحميل تفاصيل الكتاب', 'error');
    }
}

// modal close
document.addEventListener('click', (e) => {
    const modal = document.getElementById('bookModal');
    if (!modal) return;
    if (e.target.matches('.modal-close') || (e.target === modal)) {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
    }
});
