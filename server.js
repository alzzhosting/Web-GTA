const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

// Waktu server dinyalakan
const serverStartTime = Date.now();

// Path Folder & Database JSON
const DB_DIR = path.join(__dirname, 'database');
const USERS_FILE = path.join(DB_DIR, 'infoakun.json');
const MODPACKS_FILE = path.join(DB_DIR, 'modpacks.json');
const MONET_FILE = path.join(DB_DIR, 'monetloader.json');

// Pastikan Folder & File Database Tersedia
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
if (!fs.existsSync(MODPACKS_FILE)) fs.writeFileSync(MODPACKS_FILE, JSON.stringify([]));
if (!fs.existsSync(MONET_FILE)) fs.writeFileSync(MONET_FILE, JSON.stringify([]));

// Middleware Setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: 'rahasia_gta_samp_key_2026',
    resave: false,
    saveUninitialized: true
}));

// Global Variables untuk EJS
app.use((req, res, next) => {
    res.locals.serverStartTime = serverStartTime;
    res.locals.user = req.session.user || null;
    next();
});

// Helper Read/Write Data JSON
function readData(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8') || '[]');
    } catch (e) { return []; }
}
function writeData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Middleware Proteksi Auth
function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send("Akses Ditolak! Khusus Akun Admin.");
    }
    next();
}

// --- ROUTE AKUN ---
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = readData(USERS_FILE);
    const user = users.find(u => u.username === username);

    if (user && await bcrypt.compare(password, user.password)) {
        req.session.user = { username: user.username, role: user.role || 'user' };
        return res.redirect('/beranda');
    }
    res.render('login', { error: 'Username atau password salah!' });
});

app.get('/register', (req, res) => res.render('register', { error: null }));
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const users = readData(USERS_FILE);

    if (users.find(u => u.username === username)) {
        return res.render('register', { error: 'Username sudah terdaftar!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    // Akun pertama atau username 'admin' otomatis jadi Admin
    const role = (users.length === 0 || username.toLowerCase() === 'admin') ? 'admin' : 'user';

    users.push({ username, password: hashedPassword, role });
    writeData(USERS_FILE, users);
    res.redirect('/login');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- ROUTE UTAMA ---
app.get('/beranda', requireAuth, (req, res) => res.render('beranda', { page: 'beranda' }));

app.get('/modpack', requireAuth, (req, res) => {
    const modpacks = readData(MODPACKS_FILE);
    res.render('modpack', { page: 'modpack', modpacks });
});

app.get('/monetloader', requireAuth, (req, res) => {
    const scripts = readData(MONET_FILE);
    res.render('monetloader', { page: 'monetloader', scripts });
});

app.get('/store', requireAuth, (req, res) => {
    const items = [
        { produk: 'Private Modpack Low PC', harga: 'Rp 25.000', garansi: '7 Hari' },
        { produk: 'Setup Server SAMP Ready', harga: 'Rp 50.000', garansi: '30 Hari' }
    ];
    res.render('store', { page: 'store', items });
});

app.get('/payment', requireAuth, (req, res) => res.render('payment', { page: 'payment' }));

// --- FITUR DOWNLOAD COUNTER ---
app.get('/download/:type/:id', requireAuth, (req, res) => {
    const { type, id } = req.params;
    const file = type === 'modpack' ? MODPACKS_FILE : MONET_FILE;
    const items = readData(file);
    const item = items.find(i => i.id == id);

    if (item) {
        item.downloads = (item.downloads || 0) + 1;
        writeData(file, items);
        return res.redirect(item.link);
    }
    res.redirect('back');
});

// --- ROUTE ADMIN DASHBOARD ---
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
    const users = readData(USERS_FILE);
    const modpacks = readData(MODPACKS_FILE);
    const scripts = readData(MONET_FILE);
    res.render('admin', { page: 'admin', users, modpacks, scripts });
});

// Admin Actions (Tambah Data)
app.post('/admin/add-modpack', requireAuth, requireAdmin, (req, res) => {
    const { nama, versi, pembuat, link } = req.body;
    const modpacks = readData(MODPACKS_FILE);
    modpacks.push({ id: Date.now(), nama, versi, pembuat, link, downloads: 0 });
    writeData(MODPACKS_FILE, modpacks);
    res.redirect('/admin');
});

app.post('/admin/add-monetloader', requireAuth, requireAdmin, (req, res) => {
    const { nama, versi, status, link } = req.body;
    const scripts = readData(MONET_FILE);
    scripts.push({ id: Date.now(), nama, versi, status, link, downloads: 0 });
    writeData(MONET_FILE, scripts);
    res.redirect('/admin');
});

// Admin Action (Hapus Data)
app.post('/admin/delete/:type/:id', requireAuth, requireAdmin, (req, res) => {
    const { type, id } = req.params;
    const file = type === 'modpack' ? MODPACKS_FILE : MONET_FILE;
    let items = readData(file);
    items = items.filter(i => i.id != id);
    writeData(file, items);
    res.redirect('/admin');
});

app.get('/', (req, res) => res.redirect('/beranda'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER ONLINE] GTA Hub berjalan di IP 0.0.0.0:${PORT}`);
});
