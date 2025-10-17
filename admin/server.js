const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors({
    origin: 'http://localhost:5001', // or your frontend URL
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Accept']
}));
app.use(express.static('public')); // раздаём index.html из /public

// Multer: хранение в памяти (не сохраняем на диск)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB

// Простая помощь: нормализуем имя колонки (без регистра и пробелов)
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

// ---------- Safe parsing helpers ----------
function parseNumberFlexible(v) {
    if (v == null) return null;
    const n = Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

function parseDateSafe(raw) {
    if (raw == null) return null;
    // Excel serial date
    if (typeof raw === 'number' && isFinite(raw)) {
        // Excel serial dates: days since 1899-12-30
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const ms = raw * 24 * 3600 * 1000;
        const d = new Date(excelEpoch.getTime() + ms);
        return isNaN(d.getTime()) ? null : d;
    }
    let s = String(raw).trim();
    if (!s) return null;
    // Replace space between date and time to ensure ISO parsing
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
        s = s.replace(' ', 'T');
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function parseHHMMToDate(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return null;
    const m = hhmm.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    return new Date(1970, 0, 1, h, min, 0, 0);
}

function ensureISOorNull(d) {
    if (!d || isNaN(d.getTime())) return null;
    try { return d.toISOString(); } catch (_) { return null; }
}

function minutesOfDay(d) {
    if (!d || isNaN(d.getTime())) return null;
    return d.getHours() * 60 + d.getMinutes();
}

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file not provided' });

    const fname = req.file.originalname.toLowerCase();
    try {
        // read workbook from buffer (works for xlsx and csv)
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer', raw: false });

        // берем первую лист (sheet)
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // конвертируем в JSON (каждая строка -> объект, заголовки из первой строки)
        const data = xlsx.utils.sheet_to_json(sheet, { defval: null });

        if (!Array.isArray(data) || data.length === 0) {
            return res.json({ detectors: [] });
        }

        const headers = Object.keys(data[0]);

        // возможные варианты имён колонок
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
            const lat = parseNumberFlexible(rawLat);
            const lon = parseNumberFlexible(rawLon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
            const name = row[nameCol] != null ? String(row[nameCol]) : '';
            detectors.push({ name, lat, lon });
        }

        return res.json({ detectors });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'cannot parse file', message: err.message });
    }
});

// Add time-based filtering function
function filterByTimeRange(detectors, startTime, endTime) {
    if (!startTime || !endTime) return detectors;

    const start = parseHHMMToDate(startTime);
    const end = parseHHMMToDate(endTime);
    if (!start || !end) return detectors;
    const startM = minutesOfDay(start);
    const endM = minutesOfDay(end);

    return detectors.filter(d => {
        const ts = parseDateSafe(d.Временная_метка || d.timestamp || d.time || d.timeStamp);
        const m = minutesOfDay(ts);
        if (m == null) return false;
        return m >= startM && m <= endM;
    });
}

// Добавляем класс TrafficConvoyAnalyzer на сервер
class TrafficConvoyAnalyzer {
    constructor(data) {
        this.originalData = data;
        this.processedData = [];
    }

    preprocessData() {
        // Нормализация и предварительная обработка данных
        this.processedData = this.originalData.map(row => {
            const id = row.ID_детектора ?? row.detectorId ?? row.detector ?? row.id;
            const veh = row.Идентификатор_ТС ?? row.vehicle_id ?? row.vehicleId ?? row.vehicle;
            const tsRaw = row.Временная_метка ?? row.timestamp ?? row.time ?? row.timeStamp;
            const ts = parseDateSafe(tsRaw);
            const speed = parseNumberFlexible(row.Скорость_прохождения ?? row.speed ?? row.Speed);
            const lat = parseNumberFlexible(row.lat);
            const lon = parseNumberFlexible(row.lon);
            return {
                ID_детектора: id,
                Временная_метка: ensureISOorNull(ts),
                Идентификатор_ТС: veh,
                Скорость_прохождения: speed,
                lat: Number.isFinite(lat) ? lat : 54.776103 + (Math.random() - 0.5) * 0.1,
                lon: Number.isFinite(lon) ? lon : 32.056252 + (Math.random() - 0.5) * 0.1
            };
        }).filter(d => d.ID_детектора && d.Идентификатор_ТС);
    }

    findConvoys() {
        // Алгоритм обнаружения конвоев
        const convoys = [];
        const detectorMap = new Map();

        for (const row of this.processedData) {
            const { ID_детектора, Временная_метка, Идентификатор_ТС, Скорость_прохождения, lat, lon } = row;

            // Логика для определения конвоев
            if (!detectorMap.has(Идентификатор_ТС)) {
                detectorMap.set(Идентификатор_ТС, { ...row, convoy: [ID_детектора] });
            } else {
                const convoyData = detectorMap.get(Идентификатор_ТС);
                convoyData.convoy.push(ID_детектора);
                const d1 = parseDateSafe(convoyData.Временная_метка);
                const d2 = parseDateSafe(Временная_метка);
                const minD = (d1 && d2) ? new Date(Math.min(d1.getTime(), d2.getTime())) : (d1 || d2 || null);
                convoyData.Временная_метка = ensureISOorNull(minD);
                const s1 = Number.isFinite(convoyData.Скорость_прохождения) ? convoyData.Скорость_прохождения : null;
                const s2 = Number.isFinite(Скорость_прохождения) ? Скорость_прохождения : null;
                convoyData.Скорость_прохождения = Math.max(s1 ?? 0, s2 ?? 0);
                convoyData.lat = (convoyData.lat + lat) / 2;
                convoyData.lon = (convoyData.lon + lon) / 2;
            }
        }

        for (const [_, value] of detectorMap) {
            convoys.push(value);
        }

        return convoys;
    }
}

app.post('/upload/convoy', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file not provided' });

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // Обработка данных на сервере
        const analyzer = new TrafficConvoyAnalyzer(data);
        analyzer.preprocessData();
        const convoys = analyzer.findConvoys();

        // Возвращаем только необходимые данные клиенту
        const processedData = {
            convoys: convoys,
            detectors: data.map(row => ({
                ID_детектора: row.ID_детектора,
                lat: row.lat || 54.776103 + (Math.random() - 0.5) * 0.1,
                lon: row.lon || 32.056252 + (Math.random() - 0.5) * 0.1
            }))
        };

        res.json(processedData);

    } catch (err) {
        console.error('Error processing file:', err);
        res.status(500).json({ error: 'Processing error', details: err.message });
    }
});

// fallback: отдаём index.html при корневом запросе (express.static уже обслужит)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Modified server startup with port checking
const startServer = (port) => {
    const server = app.listen(port)
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} is busy, trying ${port + 1}...`);
                startServer(port + 1);
            } else {
                console.error('Server error:', err);
            }
        })
        .on('listening', () => {
            const addr = server.address();
            console.log(`Server running at http://localhost:${addr.port}`);
        });
};

// Start server with automatic port selection
startServer(5000);
