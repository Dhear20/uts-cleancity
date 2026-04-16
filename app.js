require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const path = require('path');
const mysql = require('mysql2');

const app = express();

// 1. Konfigurasi Database (RDS) menggunakan Pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Cek koneksi & buat tabel jika belum ada
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Gagal konek RDS:', err.message);
    } else {
        console.log('✅ Terhubung ke Database RDS Sydney!');
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

// 2. Konfigurasi S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_REGION
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// --- FITUR 1: Halaman Utama (Form) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- FITUR 2: Proses Upload ke S3 & Simpan ke RDS ---
app.post('/upload', upload.single('foto'), (req, res) => {
    const { nama, deskripsi } = req.body;
    
    if (!req.file) return res.send("Pilih foto dulu.");

    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: 'laporan-' + Date.now().toString() + path.extname(req.file.originalname),
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: 'public-read'
    };

    s3.upload(params, (err, s3Data) => {
        if (err) return res.status(500).send("Error S3: " + err.message);

        db.query("INSERT INTO laporan (nama, deskripsi, foto_url) VALUES (?, ?, ?)", 
        [nama, deskripsi, s3Data.Location], (dbErr) => {
            if (dbErr) {
                console.error(dbErr);
                return res.status(500).send("Error RDS: " + dbErr.message);
            }

            res.send(`
                <div style="font-family:'Poppins', sans-serif; text-align:center; margin-top:50px; color: #2d3436;">
                    <h2 style="color:#27ae60;">✔️ Laporan Berhasil Disimpan!</h2>
                    <p>Data tersimpan di RDS dan Foto di S3 Sydney.</p>
                    <hr style="width:50%; border: 1px solid #eee;">
                    <p><strong>Pelapor:</strong> ${nama}</p>
                    <p><strong>Lokasi:</strong> ${deskripsi}</p>
                    <div style="margin: 20px 0;">
                        <a href="/laporan" style="background:#27ae60; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; margin-right:10px;">Lihat Semua Laporan</a>
                        <a href="/" style="background:#bdc3c7; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Kembali</a>
                    </div>
                </div>
            `);
        });
    });
});

// --- FITUR 3: Melihat Daftar Laporan (Data dari RDS) ---
app.get('/laporan', (req, res) => {
    db.query("SELECT * FROM laporan ORDER BY waktu DESC", (err, results) => {
        if (err) return res.status(500).send("Gagal mengambil data: " + err.message);
        
        let listLaporan = results.map(row => `
            <div style="border:1px solid #edf2f7; padding:20px; margin-bottom:20px; border-radius:15px; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <p style="margin:0; color:#636e72; font-size:12px;">${new Date(row.waktu).toLocaleString('id-ID')}</p>
                <h3 style="margin:10px 0; color:#2d3436;">${row.nama}</h3>
                <p style="color:#2d3436;">📍 ${row.deskripsi}</p>
                <img src="${row.foto_url}" style="width:100%; max-width:300px; border-radius:10px; margin-top:10px; border: 1px solid #eee;">
            </div>
        `).join('');

        res.send(`
            <body style="font-family:'Poppins', sans-serif; background-color:#f0f2f5; margin:0; padding:20px;">
                <div style="max-width:600px; margin:auto;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
                        <h2 style="color:#27ae60; margin:0;">Daftar Laporan 🌿</h2>
                        <a href="/" style="text-decoration:none; color:#27ae60; font-weight:bold;">+ Tambah Baru</a>
                    </div>
                    ${listLaporan.length > 0 ? listLaporan : '<p style="text-align:center; color:#b2bec3;">Belum ada laporan.</p>'}
                </div>
            </body>
        `);
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Aplikasi CleanCity jalan di http://localhost:${PORT}`));