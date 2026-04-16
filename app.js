require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const path = require('path');
const mysql = require('mysql2');

const app = express();

// --- 1. Koneksi Database (RDS) ---
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
});

// Cek koneksi & buat tabel otomatis
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database RDS Error:', err.message);
    } else {
        console.log('✅ Koneksi RDS Sydney Berhasil!');
        const sql = `CREATE TABLE IF NOT EXISTS laporan (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nama VARCHAR(255),
            deskripsi TEXT,
            foto_url VARCHAR(255),
            waktu TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
        connection.query(sql);
        connection.release();
    }
});

// --- 2. Konfigurasi S3 ---
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_REGION
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// --- 3. RUTE NAVIGASI ---

// Halaman Utama (Home)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Proses Upload (Dari Form ke S3 & RDS)
app.post('/upload', upload.single('foto'), (req, res) => {
    const { nama, deskripsi } = req.body;
    if (!req.file) return res.send("Silakan pilih foto bukti.");

    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `laporan-${Date.now()}${path.extname(req.file.originalname)}`,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: 'public-read'
    };

    s3.upload(params, (err, s3Data) => {
        if (err) return res.status(500).send("Gagal upload S3: " + err.message);

        db.query("INSERT INTO laporan (nama, deskripsi, foto_url) VALUES (?, ?, ?)", 
        [nama, deskripsi, s3Data.Location], (dbErr) => {
            if (dbErr) return res.status(500).send("Gagal simpan database: " + dbErr.message);
            
            // Redirect ke halaman daftar laporan setelah sukses
            res.redirect('/laporan');
        });
    });
});

// Halaman Daftar Laporan (Ini yang bikin tombol tadi jalan!)
app.get('/laporan', (req, res) => {
    db.query("SELECT * FROM laporan ORDER BY waktu DESC", (err, results) => {
        if (err) return res.status(500).send("Database Error: " + err.message);
        
        // Buat tampilan daftar laporan yang senada dengan warna hijau
        let content = results.map(row => `
            <div style="background: white; padding: 20px; border-radius: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin-bottom: 20px; border-left: 5px solid #27ae60;">
                <p style="color: #636e72; font-size: 12px; margin: 0;">${new Date(row.waktu).toLocaleString('id-ID')}</p>
                <h3 style="color: #2d3436; margin: 10px 0;">${row.nama}</h3>
                <p style="color: #2d3436;">📍 ${row.deskripsi}</p>
                <img src="${row.foto_url}" style="width: 100%; max-width: 400px; border-radius: 10px; border: 1px solid #eee;">
            </div>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <title>Daftar Laporan - CleanCity</title>
                <style>
                    body { font-family: 'Poppins', sans-serif; background: #f4f9f4; padding: 30px; margin: 0; }
                    .header { display: flex; justify-content: space-between; align-items: center; max-width: 700px; margin: 0 auto 30px; }
                    .header h2 { color: #27ae60; margin: 0; }
                    .btn-back { text-decoration: none; background: #27ae60; color: white; padding: 10px 20px; border-radius: 8px; font-size: 14px; }
                    .container { max-width: 700px; margin: auto; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>Daftar Laporan 🌿</h2>
                    <a href="/" class="btn-back">← Kembali</a>
                </div>
                <div class="container">
                    ${results.length > 0 ? content : '<p style="text-align:center; color:#b2bec3;">Belum ada laporan masuk.</p>'}
                </div>
            </body>
            </html>
        `);
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 CleanCity Backend running on http://localhost:${PORT}`));