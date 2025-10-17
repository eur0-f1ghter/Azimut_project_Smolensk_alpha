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
            const lat = parseFloat(rawLat);
            const lon = parseFloat(rawLon);
            if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
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

    const start = new Date(startTime);
    const end = new Date(endTime);

    return detectors.filter(d => {
        const timestamp = new Date(d.Временная_метка);
        return timestamp >= start && timestamp <= end;
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
        this.processedData = this.originalData.map(row => ({
            ID_детектора: row.ID_детектора,
            Временная_метка: new Date(row.Временная_метка).toISOString(),
            Идентификатор_ТС: row.Идентификатор_ТС,
            Скорость_прохождения: row.Скорость_прохождения ? parseFloat(row.Скорость_прохождения) : null,
            lat: row.lat || 54.776103 + (Math.random() - 0.5) * 0.1,
            lon: row.lon || 32.056252 + (Math.random() - 0.5) * 0.1
        })).filter(d => d.ID_детектора && d.Идентификатор_ТС);
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
                convoyData.Временная_метка = new Date(Math.min(new Date(convoyData.Временная_метка), new Date(Временная_метка))).toISOString();
                convoyData.Скорость_прохождения = Math.max(convoyData.Скорость_прохождения, Скорость_прохождения);
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
