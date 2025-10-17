import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import xlsx from 'xlsx';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------- Config ----------
const DB_PATH = './users.db';
const JWT_SECRET = process.env.JWT_SECRET || 'replace_this_with_a_long_random_secret_in_prod';
const JWT_EXPIRES_IN = '2h'; // token lifetime
const DEFAULT_PORT = Number(process.env.PORT) || 3000;

// --------- Init express ----------
const app = express();

// security & middleware
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS: если фронт и бэкенд на одном домене, можно ограничить origin.
// Пока разрешаем credentials, origin true (подставляет откуда пришёл запрос)
app.use(cors({ origin: true, credentials: true }));

// static files
app.use(express.static(path.join(__dirname, 'public')));

// --------- Multer (upload in memory) ----------
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB

// --------- Helpers for XLSX parsing ----------
function normalizeColName(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, '');
}
function findColumnKey(rowKeys, candidates) {
    const lowerKeys = rowKeys.map(k => normalizeColName(k));
    for (const c of candidates) {
        const nc = normalizeColName(c);
        const idx = lowerKeys.indexOf(nc);
        if (idx !== -1) return rowKeys[idx];
    }
    return null;
}

// time filtering helper used by convoy route
function filterByTimeRange(detectors, startTime, endTime) {
    if (!startTime || !endTime) return detectors;
    const start = new Date(startTime);
    const end = new Date(endTime);
    return detectors.filter(d => {
        const ts = d.Временная_метка ? new Date(d.Временная_метка) : null;
        if (!ts || isNaN(ts.getTime())) return false;
        return ts >= start && ts <= end;
    });
}

// ---------- DB (SQLite) ----------
const db = new Database(DB_PATH);
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT
  )
`).run();

// --------- Auth helpers ----------
function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

// rate limiter for login
const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Too many requests, try later' }
});

// ---------------- Routes: upload (detectors list) ----------------
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file not provided' });

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer', raw: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { defval: null });

        if (!Array.isArray(data) || data.length === 0) return res.json({ detectors: [] });

        const headers = Object.keys(data[0]);

        const nameCandidates = ['Name', 'Название', 'id', 'ID', 'Detector', 'ID_детектора'];
        const latCandidates = ['Latitude', 'Lat', 'Широта', 'latitude', 'lat'];
        const lonCandidates = ['Longitude', 'Lon', 'Долгота', 'longitude', 'lon'];

        const nameCol = findColumnKey(headers, nameCandidates) || headers[0];
        const latCol = findColumnKey(headers, latCandidates);
        const lonCol = findColumnKey(headers, lonCandidates);

        if (!latCol || !lonCol) {
            return res.status(400).json({ error: 'Не найдены столбцы с координатами (Latitude/Longitude)' });
        }

        const detectors = [];
        for (const row of data) {
            const rawLat = row[latCol];
            const rawLon = row[lonCol];
            if (rawLat == null || rawLon == null) continue;
            const lat = parseFloat(rawLat);
            const lon = parseFloat(rawLon);
            if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
            const name = row[nameCol] != null ? String(row[nameCol]) : '';
            detectors.push({ name, lat, lon });
        }

        return res.json({ detectors });
    } catch (err) {
        console.error('Error in /upload:', err);
        return res.status(500).json({ error: 'cannot parse file', message: err.message });
    }
});

// ---------------- Routes: upload convoy (with time filtering) ----------------
app.post('/upload/convoy', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file not provided' });

    const startTime = req.body.startTime;
    const endTime = req.body.endTime;
    console.log('Received time range:', { startTime, endTime });

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer', raw: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { defval: null });

        if (!Array.isArray(data) || data.length === 0) return res.json({ detectors: [] });

        const headers = Object.keys(data[0]);

        const idDetectorCol = findColumnKey(headers, ['ID_детектора', 'DetectorID', 'Detector', 'id']);
        const timestampCol = findColumnKey(headers, ['Временная_метка', 'Timestamp', 'Time', 'Date']);
        const vehicleIdCol = findColumnKey(headers, ['Идентификатор_ТС', 'VehicleID', 'Vehicle', 'vehicle']);
        const speedCol = findColumnKey(headers, ['Скорость_прохождения', 'Speed', 'speed']);
        const latCol = findColumnKey(headers, ['Latitude', 'Lat', 'Широта', 'latitude']);
        const lonCol = findColumnKey(headers, ['Longitude', 'Lon', 'Долгота', 'longitude']);

        if (!idDetectorCol || !timestampCol || !vehicleIdCol) {
            return res.status(400).json({
                error: 'Не найдены обязательные столбцы (ID_детектора, Временная_метка, Идентификатор_ТС)'
            });
        }

        let detectors = data.map(row => ({
            ID_детектора: row[idDetectorCol],
            Временная_метка: row[timestampCol] ? new Date(row[timestampCol]).toISOString() : null,
            Идентификатор_ТС: row[vehicleIdCol],
            Скорость_прохождения: speedCol ? (row[speedCol] != null ? parseFloat(row[speedCol]) : null) : null,
            lat: latCol ? (row[latCol] != null ? parseFloat(row[latCol]) : null) : null,
            lon: lonCol ? (row[lonCol] != null ? parseFloat(row[lonCol]) : null) : null
        })).filter(d => d.ID_детектора && d.Идентификатор_ТС);

        // Fill missing coords with default/random nearby (as you had)
        detectors = detectors.map(d => {
            const defaultLat = 54.776103;
            const defaultLon = 32.056252;
            return {
                ...d,
                lat: (d.lat != null && !Number.isNaN(d.lat)) ? d.lat : defaultLat + (Math.random() - 0.5) * 0.1,
                lon: (d.lon != null && !Number.isNaN(d.lon)) ? d.lon : defaultLon + (Math.random() - 0.5) * 0.1
            };
        });

        if (startTime && endTime) {
            detectors = filterByTimeRange(detectors, startTime, endTime);
        }

        return res.json({ detectors });
    } catch (err) {
        console.error('Error processing convoy file:', err);
        return res.status(500).json({ error: 'cannot parse file', message: err.message });
    }
});

// -------------- Auth routes (login/logout/me) --------------
app.use('/api/login', loginLimiter);
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const row = db.prepare('SELECT id, email, password_hash, display_name FROM users WHERE email = ?').get(String(email).toLowerCase());
        if (!row) return res.status(401).json({ error: 'Invalid credentials' });

        const ok = await bcrypt.compare(password, row.password_hash);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

        const token = signToken({ userId: row.id, email: row.email });

        res.cookie('auth_token', token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 2 * 60 * 60 * 1000
        });

        return res.json({ success: true });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    const token = req.cookies?.auth_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Invalid token' });

    const row = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(payload.userId);
    if (!row) return res.status(401).json({ error: 'User not found' });

    return res.json({ id: row.id, email: row.email, displayName: row.display_name });
});

app.get('/api/admin-data', (req, res) => {
    const token = req.cookies?.auth_token;
    const payload = token ? verifyToken(token) : null;
    if (!payload) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ msg: 'Welcome to admin area', user: payload.email });
});

// fallback to serve login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ------------- Start server with automatic port fallback -------------
function startServer(port) {
    const server = app.listen(port)
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} busy, trying ${port + 1}...`);
                startServer(port + 1);
            } else {
                console.error('Server error:', err);
            }
        })
        .on('listening', () => {
            console.log(`Server running at http://localhost:${server.address().port}`);
        });
}

startServer(DEFAULT_PORT);