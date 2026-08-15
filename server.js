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

const { MongoClient, ServerApiVersion } = require('mongodb');

// 1. KONEKSI RESMI MONGODB ATLAS STABLE API
// Pastikan ganti <db_password> dengan password database kamu yang sebenarnya
const uri = "mongodb+srv://dyraaguest_db_user:j7jP600GTPhcxLe@database.72hinz0.mongodb.net/?appName=Database";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let dbInstance = null;

// Fungsi Pembantu Ambil Database (Koneksi Persisten untuk Express)
async function getDatabase() {
  if (!dbInstance) {
    console.log("⏳ Menghubungkan ke MongoDB Atlas (Stable API)...");
    await client.connect();
    
    // Tes ping seperti contoh resmi MongoDB
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Ping berhasil! Berhasil terhubung ke MongoDB Atlas!");
    
    // Menyimpan nama database project kita
    dbInstance = client.db("gta_hub_db");
  }
  return dbInstance;
}

// 2. ROUTE REGISTRASI
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('register', { error: 'Username dan Password wajib diisi!' });
  }

  try {
    const db = await getDatabase();
    const usersCollection = db.collection('users');

    const userExist = await usersCollection.findOne({ username });
    if (userExist) {
      return res.render('register', { error: 'Username sudah terdaftar!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const count = await usersCollection.countDocuments();
    const role = (count === 0 || username.toLowerCase() === 'admin') ? 'admin' : 'user';

    await usersCollection.insertOne({
      username: username,
      password: hashedPassword,
      role: role,
      createdAt: new Date()
    });

    console.log(`✅ User "${username}" berhasil terdaftar via Stable API!`);
    res.redirect('/login');

  } catch (err) {
    console.error("❌ Error Registrasi:", err);
    res.render('register', { error: 'Gagal mendaftar: ' + err.message });
  }
});

// -------------------------------------------------------------
// 3. ROUTE LOGIN (MongoClient)
// -------------------------------------------------------------
// Menampilkan Halaman Login
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const usersCollection = db.collection('users');

        // Cari dokumen user berdasarkan username
        const user = await usersCollection.findOne({ username });

        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = { username: user.username, role: user.role };
            return res.redirect('/beranda');
        }

        res.render('login', { error: 'Username atau password salah!' });

    } catch (err) {
        console.error('❌ DETIL ERROR LOGIN:', err);
        res.render('login', { error: 'Terjadi kesalahan sistem.' });
    }
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

//-------------------Admin Chat
const CHATS_FILE = path.join(DB_DIR, 'chats.json');
if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, JSON.stringify([]));

function getFormattedDate() {
    return new Date().toLocaleDateString('id-ID'); // Format dd/mm/yy
}

// Route Chat User
app.get('/chat', requireAuth, (req, res) => {
    const chats = readData(CHATS_FILE).filter(c => c.user === req.session.user.username);
    res.render('chat', { page: 'chat', messages: chats });
});

app.post('/chat/send', requireAuth, (req, res) => {
    const { pesan } = req.body;
    const chats = readData(CHATS_FILE);
    chats.push({ 
        user: req.session.user.username, 
        pesan, 
        tanggal: getFormattedDate(), 
        admin: null, 
        sender: 'user' 
    });
    writeData(CHATS_FILE, chats);
    res.redirect('/chat');
});

// Route Admin: List User Chat
app.get('/admin/chats', requireAuth, requireAdmin, (req, res) => {
    const chats = readData(CHATS_FILE);
    const usersWithChats = [...new Set(chats.map(c => c.user))]; // Ambil list user unik
    res.render('admin_chats', { page: 'admin', users: usersWithChats });
});

// Route Admin: Buka Chat User
app.get('/admin/chats/:username', requireAuth, requireAdmin, (req, res) => {
    const chats = readData(CHATS_FILE).filter(c => c.user === req.params.username);
    res.render('admin_chat_view', { page: 'admin', messages: chats, chatUser: req.params.username });
});

// Admin Membalas
app.post('/admin/chats/:username/reply', requireAuth, requireAdmin, (req, res) => {
    const { pesan } = req.body;
    const chats = readData(CHATS_FILE);
    chats.push({ 
        user: req.params.username, 
        pesan, 
        tanggal: getFormattedDate(), 
        admin: req.session.user.username, 
        sender: 'admin' 
    });
    writeData(CHATS_FILE, chats);
    res.redirect(`/admin/chats/${req.params.username}`);
});


app.get('/', (req, res) => res.redirect('/beranda'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER ONLINE] GTA Hub berjalan di IP 0.0.0.0:${PORT}`);
});
