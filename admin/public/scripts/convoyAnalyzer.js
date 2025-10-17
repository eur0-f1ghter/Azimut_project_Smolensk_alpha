// Safe parsing helpers (client-side)
function parseDateSafeClient(raw) {
    if (raw == null) return null;
    if (typeof raw === 'number' && isFinite(raw)) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const ms = raw * 24 * 3600 * 1000;
        const d = new Date(excelEpoch.getTime() + ms);
        return isNaN(d.getTime()) ? null : d;
    }
    let s = String(raw).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
        s = s.replace(' ', 'T');
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function parseHHMMtoMinutes(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return null;
    const m = hhmm.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
    return h * 60 + mi;
}

class TrafficConvoyAnalyzer {
    constructor(data) {
        this.data = data;
        this.vehicleEvents = new Map();
        this.detectorEvents = new Map();
    }

    preprocessData() {
        console.log("Preprocessing data...");

        this.vehicleEvents.clear();
        this.detectorEvents.clear();

        (this.data || []).forEach(row => {
            const vehicle = row.Идентификатор_ТС ?? row.vehicleId ?? row.vehicle_id ?? row.vehicle;
            const detectorId = row.ID_детектора ?? row.detectorId ?? row.detector ?? row.id;
            const ts = parseDateSafeClient(row.Временная_метка ?? row.timestamp ?? row.time ?? row.timeStamp);
            if (!vehicle || !detectorId || !ts || isNaN(ts.getTime())) return; // skip invalid

            if (!this.vehicleEvents.has(vehicle)) {
                this.vehicleEvents.set(vehicle, []);
            }
            this.vehicleEvents.get(vehicle).push({
                detector: String(detectorId),
                timestamp: ts,
                speed: row.Скорость_прохождения ?? row.speed ?? null,
                lat: row.lat,
                lon: row.lon
            });

            if (!this.detectorEvents.has(detectorId)) {
                this.detectorEvents.set(String(detectorId), []);
            }
            this.detectorEvents.get(String(detectorId)).push({
                vehicle: String(vehicle),
                timestamp: ts,
                speed: row.Скорость_прохождения ?? row.speed ?? null,
                lat: row.lat,
                lon: row.lon
            });
        });

        // Sort events by timestamp
        this.vehicleEvents.forEach(events => {
            events.sort((a, b) => a.timestamp - b.timestamp);
        });
        this.detectorEvents.forEach(events => {
            events.sort((a, b) => a.timestamp - b.timestamp);
        });
    }

    findConvoys(maxTimeGap = 300, minCommonDetectors = 2, minConvoySize = 2) {
        console.log("Finding convoys...");

        // Find candidate pairs
        const candidatePairs = this._findCandidatePairs(maxTimeGap);
        console.log(`Found ${candidatePairs.size} candidate pairs`);

        // Filter pairs by common detectors
        const validPairs = this._filterPairs(candidatePairs, minCommonDetectors);
        console.log(`Found ${validPairs.size} valid pairs`);

        // Build convoys from valid pairs
        const convoys = this._buildConvoys(validPairs, minConvoySize);

        return convoys;
    }

    _findCandidatePairs(maxTimeGap) {
        const candidatePairs = new Set();

        this.detectorEvents.forEach((events) => {
            for (let i = 0; i < events.length; i++) {
                const event1 = events[i];
                for (let j = i + 1; j < events.length; j++) {
                    const event2 = events[j];

                    const t1 = event1?.timestamp?.getTime?.();
                    const t2 = event2?.timestamp?.getTime?.();
                    if (!Number.isFinite(t1) || !Number.isFinite(t2)) continue;
                    const timeDiff = (t2 - t1) / 1000;
                    if (timeDiff < 0) continue;
                    if (timeDiff > maxTimeGap) break;

                    if (event1.vehicle !== event2.vehicle) {
                        const pair = [event1.vehicle, event2.vehicle].sort().join(',');
                        candidatePairs.add(pair);
                    }
                }
            }
        });

        return candidatePairs;
    }

    _filterPairs(candidatePairs, minCommon) {
        const validPairs = new Set();

        candidatePairs.forEach(pairStr => {
            const [v1, v2] = pairStr.split(',');

            const events1 = this.vehicleEvents.get(v1) || [];
            const events2 = this.vehicleEvents.get(v2) || [];
            const detectors1 = new Set(events1.map(e => e.detector));
            const detectors2 = new Set(events2.map(e => e.detector));
            const commonDetectors = [...detectors1].filter(x => detectors2.has(x));

            if (commonDetectors.length >= minCommon) {
                let validCommon = 0;

                commonDetectors.forEach(detector => {
                    const e1 = events1.find(e => e.detector === detector);
                    const e2 = events2.find(e => e.detector === detector);
                    const t1 = e1?.timestamp?.getTime?.();
                    const t2 = e2?.timestamp?.getTime?.();
                    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return;
                    if (Math.abs(t1 - t2) / 1000 <= 120) {
                        validCommon++;
                    }
                });

                if (validCommon >= minCommon) {
                    validPairs.add(pairStr);
                }
            }
        });

        return validPairs;
    }

    _buildConvoys(validPairs, minConvoySize) {
        const graph = new Map();

        validPairs.forEach(pairStr => {
            const [v1, v2] = pairStr.split(',');
            if (!graph.has(v1)) graph.set(v1, new Set());
            if (!graph.has(v2)) graph.set(v2, new Set());
            graph.get(v1).add(v2);
            graph.get(v2).add(v1);
        });

        const visited = new Set();
        const convoys = [];

        graph.forEach((_, vehicle) => {
            if (!visited.has(vehicle)) {
                const convoy = new Set();
                const stack = [vehicle];

                while (stack.length > 0) {
                    const current = stack.pop();
                    if (!visited.has(current)) {
                        visited.add(current);
                        convoy.add(current);
                        if (graph.get(current)) {
                            graph.get(current).forEach(neighbor => {
                                if (!visited.has(neighbor)) stack.push(neighbor);
                            });
                        }
                    }
                }

                if (convoy.size >= minConvoySize) {
                    convoys.push(this._analyzeConvoy(convoy));
                }
            }
        });

        return convoys;
    }

    _analyzeConvoy(convoyVehicles) {
        let commonDetectors = null;
        const allTimes = [];

        convoyVehicles.forEach(vehicle => {
            const detectors = new Set(this.vehicleEvents.get(vehicle).map(e => e.detector));

            if (commonDetectors === null) {
                commonDetectors = detectors;
            } else {
                commonDetectors = new Set([...commonDetectors].filter(x => detectors.has(x)));
            }

            this.vehicleEvents.get(vehicle).forEach(event => {
                if (commonDetectors.has(event.detector)) {
                    allTimes.push(event.timestamp);
                }
            });
        });

        let duration = 0;
        if (allTimes.length > 0) {
            const startTime = Math.min(...allTimes.map(t => t.getTime()));
            const endTime = Math.max(...allTimes.map(t => t.getTime()));
            duration = (endTime - startTime) / (1000 * 60);
        }

        return {
            vehicles: [...convoyVehicles].sort(),
            size: convoyVehicles.size,
            commonDetectorsCount: commonDetectors ? commonDetectors.size : 0,
            commonDetectors: commonDetectors ? [...commonDetectors].sort() : [],
            durationMinutes: Math.round(duration * 10) / 10
        };
    }

    filterByTimeRange(startTime, endTime) {
        const startM = parseHHMMtoMinutes(startTime);
        const endM = parseHHMMtoMinutes(endTime);
        if (startM == null || endM == null) return this.data;
        return (this.data || []).filter(record => {
            const ts = parseDateSafeClient(record.Временная_метка ?? record.timestamp ?? record.time ?? record.timeStamp);
            if (!ts || isNaN(ts.getTime())) return false;
            const m = ts.getHours() * 60 + ts.getMinutes();
            return m >= startM && m <= endM;
        });
    }

    analyzeRoutes(data, topN = 10) {
        const routes = new Map(); // key: "detector1,detector2", value: route stats

        // Group vehicles by their sequence of detectors
        const vehiclePaths = new Map();

        data.forEach(record => {
            if (!vehiclePaths.has(record.Идентификатор_ТС)) {
                vehiclePaths.set(record.Идентификатор_ТС, []);
            }
            vehiclePaths.get(record.Идентификатор_ТС).push({
                detector: record.ID_детектора,
                timestamp: new Date(record.Временная_метка),
                speed: record.Скорость_прохождения,
                lat: record.lat,
                lon: record.lon
            });
        });

        // Sort each vehicle's path by timestamp
        vehiclePaths.forEach(path => {
            path.sort((a, b) => a.timestamp - b.timestamp);
        });

        // Analyze routes
        vehiclePaths.forEach((path, vehicleId) => {
            for (let i = 0; i < path.length - 1; i++) {
                const routeKey = `${path[i].detector},${path[i+1].detector}`;
                if (!routes.has(routeKey)) {
                    routes.set(routeKey, {
                        count: 0,
                        speeds: [],
                        times: [],
                        coordinates: [
                            [path[i].lat, path[i].lon],
                            [path[i+1].lat, path[i+1].lon]
                        ],
                        startDetector: path[i].detector,
                        endDetector: path[i+1].detector
                    });
                }

                const route = routes.get(routeKey);
                route.count++;
                route.speeds.push(path[i].speed);
                route.times.push((path[i+1].timestamp - path[i].timestamp) / 1000 / 60); // minutes
            }
        });

        // Calculate statistics
        const routeStats = Array.from(routes.entries()).map(([key, data]) => ({
            route: key,
            vehicleCount: data.count,
            intensity: data.count / ((new Date() - new Date(0)) / 1000 / 3600), // vehicles per hour (placeholder)
            avgSpeed: data.speeds.reduce((a, b) => a + b, 0) / data.speeds.length,
            avgTime: data.times.reduce((a, b) => a + b, 0) / data.times.length,
            coordinates: data.coordinates,
            startDetector: data.startDetector,
            endDetector: data.endDetector
        }));

        // Return top N routes by vehicle count
        return routeStats
            .sort((a, b) => b.vehicleCount - a.vehicleCount)
            .slice(0, topN);
    }

    // New method to build convoy graph: nodes are vehicles, edges connect vehicles in convoys
    buildConvoyGraph(convoys) {
        const nodes = new Map(); // vehicleId -> {id, lat, lon, convoys: []}
        const edges = []; // [{from, to, convoyId, weight}]

        convoys.forEach((convoy, convoyIndex) => {
            convoy.vehicles.forEach(vehicleId => {
                if (!nodes.has(vehicleId)) {
                    // Find average position for the vehicle across its detectors
                    const vehicleEvents = this.vehicleEvents.get(vehicleId) || [];
                    const avgLat = vehicleEvents.reduce((sum, e) => sum + e.lat, 0) / vehicleEvents.length;
                    const avgLon = vehicleEvents.reduce((sum, e) => sum + e.lon, 0) / vehicleEvents.length;
                    nodes.set(vehicleId, {
                        id: vehicleId,
                        lat: avgLat || 54.776103,
                        lon: avgLon || 32.056252,
                        convoys: []
                    });
                }
                nodes.get(vehicleId).convoys.push(convoyIndex);
            });

            // Create edges between all pairs in the convoy
            for (let i = 0; i < convoy.vehicles.length; i++) {
                for (let j = i + 1; j < convoy.vehicles.length; j++) {
                    edges.push({
                        from: convoy.vehicles[i],
                        to: convoy.vehicles[j],
                        convoyId: convoyIndex,
                        weight: 1 // Could be based on common detectors or duration
                    });
                }
            }
        });

        return { nodes: Array.from(nodes.values()), edges };
    }

    // New method to build route graph: nodes are detectors, edges are transitions
    buildRouteGraph(routeStats) {
        const nodes = new Map(); // detectorId -> {id, lat, lon}
        const edges = []; // [{from, to, weight, coordinates}]

        routeStats.forEach(route => {
            const [startId, endId] = route.route.split(',');
            const startDetector = window.allDetectorsData.find(d => d.id === startId);
            const endDetector = window.allDetectorsData.find(d => d.id === endId);

            if (startDetector && endDetector) {
                if (!nodes.has(startId)) {
                    nodes.set(startId, {
                        id: startId,
                        lat: startDetector.lat,
                        lon: startDetector.lon,
                        name: startDetector.displayName || startId
                    });
                }
                if (!nodes.has(endId)) {
                    nodes.set(endId, {
                        id: endId,
                        lat: endDetector.lat,
                        lon: endDetector.lon,
                        name: endDetector.displayName || endId
                    });
                }

                edges.push({
                    from: startId,
                    to: endId,
                    weight: route.vehicleCount,
                    coordinates: route.coordinates,
                    avgSpeed: route.avgSpeed,
                    avgTime: route.avgTime
                });
            }
        });

        return { nodes: Array.from(nodes.values()), edges };
    }
}

// Collections placeholder; will be initialized after ymaps and map/clusterer are ready
window.collections = {};

function initCollections() {
    if (!window || !window.ymaps) return;
    if (!window.map || !window.clusterer) return;

    if (!window.collections.detectors) {
        window.collections.detectors = new ymaps.GeoObjectCollection({}, { preset: 'islands#blueIcon' });
        window.clusterer.add(window.collections.detectors);
    }
    if (!window.collections.convoys) {
        window.collections.convoys = new ymaps.GeoObjectCollection({}, { preset: 'islands#redIcon' });
        window.clusterer.add(window.collections.convoys);
    }
    if (!window.collections.routes) {
        window.collections.routes = new ymaps.GeoObjectCollection({}, { zIndex: 1000 });
        window.clusterer.add(window.collections.routes);
    }
}

// Initialize collections on map load
ymaps.ready(() => {
    initCollections();
});

function normalizePositions(rawList) {
    // rawList rows: Name, Latitude, Longitude (case-insensitive)
    window.detectorPositions = window.detectorPositions || {};
    (rawList || []).forEach(item => {
        const name = item.Name ?? item.name ?? item.Name?.trim?.() ?? null;
        const latRaw = item.Latitude ?? item.latitude ?? item.Lat ?? item.lat ?? null;
        const lonRaw = item.Longitude ?? item.longitude ?? item.Lon ?? item.lon ?? null;
        const lat = latRaw == null ? null : Number(String(latRaw).replace(',', '.'));
        const lon = lonRaw == null ? null : Number(String(lonRaw).replace(',', '.'));
        if (name && Number.isFinite(lat)    && Number.isFinite(lon)) {
            // key by both Name and possible ID (D1 etc)
            window.detectorPositions[String(name)] = { name: String(name), lat, lon };
        }
    });
}

function normalizeDetectors(rawList) {
    const defaultLat = 54.776103;
    const defaultLon = 32.056252;
    window.detectorPositions = window.detectorPositions || {};

    return (rawList || []).map(item => {
        // поддерживаем разные варианты названий колонок
        const idRaw = item.ID_детектора ?? item.detectorId ?? item.detector ?? item.Name ?? item.name ?? item.id ?? 'unknown';
        const id = String(idRaw).trim();
        const vehicleId = (item.Идентификатор_ТС ?? item.VehicleID ?? item.vehicle ?? item.vehicleId ?? '').toString().trim() || null;
        const rawTs = item.Временная_метка ?? item.timestamp ?? item.time ?? item.timeStamp ?? item.timestampISO ?? null;
        let timestampDate = null;
        if (rawTs) {
            // Try safe parsing: if format "YYYY-MM-DD HH:MM:SS" replace space with 'T' for reliable parsing
            let s = String(rawTs).trim();
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T');
            timestampDate = new Date(s);
            if (isNaN(timestampDate.getTime())) timestampDate = null;
        }
        const speed = (() => {
            const v = item.Скорость_прохождения ?? item.Speed ?? item.speed ?? null;
            if (v == null) return null;
            const n = Number(String(v).replace(',', '.'));
            return Number.isFinite(n) ? n : null;
        })();

        // lat/lon: prefer explicit columns, then detectorPositions lookup by id/name, else fallback random near default
        let lat = null;
        let lon = null;
        const latRaw = item.lat ?? item.Latitude ?? item.latitude ?? item.Широта ?? null;
        const lonRaw = item.lon ?? item.Longitude ?? item.longitude ?? item.Долгота ?? null;
        if (latRaw != null && lonRaw != null) {
            const ln = Number(String(latRaw).replace(',', '.'));
            const lo = Number(String(lonRaw).replace(',', '.'));
            if (Number.isFinite(ln) && Number.isFinite(lo)) { lat = ln; lon = lo; }
        }
        if (lat == null || lon == null) {
            // try lookup by id or by Name stored ранее
            const pos = window.detectorPositions[id] || window.detectorPositions[item.Name] || window.detectorPositions[String(item.Name ?? '')];
            if (pos) { lat = pos.lat; lon = pos.lon; }
        }
        if (lat == null || lon == null) {
            lat = defaultLat + (Math.random() - 0.5) * 0.01;
            lon = defaultLon + (Math.random() - 0.5) * 0.01;
        }

        return {
            raw: item,
            id,
            vehicleId,
            timestampISO: timestampDate ? timestampDate.toISOString() : null,
            timestampDate: timestampDate,
            speed,
            lat,
            lon,
            displayName: (window.detectorPositions[id]?.name) ?? (item.Name ?? item.Name?.trim?.()) ?? id
        };
    });
}

// Глобальные переменные для хранения данных
window.allDetectorsData = []; // Все детекторы
window.convoyData = []; // Данные конвоев

document.getElementById('uploadBtn1').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput1');
    const status = document.getElementById('fileInfo1');

    if (!fileInput.files || !fileInput.files[0]) {
        status.textContent = 'Выберите файл (CSV/XLSX)';
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    status.textContent = 'Загружаю...';

    try {
        const resp = await fetch('/upload/convoy', {
            method: 'POST',
            body: formData
        });

        if (!resp.ok) {
            const txt = await resp.text().catch(()=>null);
            throw new Error(`Upload failed: ${resp.status} ${resp.statusText} ${txt||''}`);
        }

        const data = await resp.json();

        const rows = data.detectors || [];
        const first = rows[0] || {};
        const hasLatLon = Object.keys(first).some(k => /lat|latitude|longitude|Longitude|Latitude/i.test(k));
        const hasName = Object.keys(first).some(k => /name|Name/i.test(k));
        const hasDetectorId = Object.keys(first).some(k => /ID_детектора|detector|Detector/i.test(k));
        const hasTimestamp = Object.keys(first).some(k => /Временная_метка|timestamp|time/i.test(k));

        if (hasLatLon && hasName && !hasTimestamp) {
            normalizePositions(rows);
            if (window.rawEventRows) {
                window.allDetectorsData = normalizeDetectors(window.rawEventRows);
                // re-run analysis & map
                const analyzer = new TrafficConvoyAnalyzer(window.allDetectorsData.map(d => ({
                    ID_детектора: d.id,
                    Временная_метка: d.timestampISO,
                    Идентификатор_ТС: d.vehicleId,
                    Скорость_прохождения: d.speed,
                    lat: d.lat,
                    lon: d.lon
                })));
                analyzer.preprocessData();
                window.convoyData = analyzer.findConvoys();
                updateAllDetectorsOnMap();
            }
            status.textContent = `Импортировано позиций: ${Object.keys(window.detectorPositions).length}`;
            return;
        }

        window.rawEventRows = rows;
        window.allDetectorsData = normalizeDetectors(rows);

        // Анализируем конвои на клиенте по нормализованным данным
        const analyzer = new TrafficConvoyAnalyzer(window.allDetectorsData.map(d => ({
            ID_детектора: d.id,
            Временная_метка: d.timestampISO,
            Идентификатор_ТС: d.vehicleId,
            Скорость_прохождения: d.speed,
            lat: d.lat,
            lon: d.lon
        })));
        analyzer.preprocessData();
        const convoys = analyzer.findConvoys();

        // Store convoy data globally
        window.convoyData = convoys;

        // Обновляем карту - показываем ВСЕ детекторы
        updateAllDetectorsOnMap();

        status.textContent = `Загружено детекторов: ${window.allDetectorsData.length}. Найдено конвоев: ${convoys.length}`;

    } catch (e) {
        console.error('Error:', e);
        status.textContent = `Ошибка: ${e.message}`;
    }
});


function updateAllDetectorsOnMap() {
    initCollections();
    if (!window.clusterer || !window.allDetectorsData || !window.allDetectorsData.length) {
        console.warn('No data or clusterer available');
        return;
    }

    // Clear only detector markers, keep other collections
    window.collections.detectors.removeAll();

    const placemarks = window.allDetectorsData.map(detector => {
        const timeStr = detector.timestampDate ? detector.timestampDate.toLocaleString() : '—';
        const vehicleStr = detector.vehicleId ?? '—';
        const speedStr = detector.speed != null ? `${detector.speed} км/ч` : '—';
        const name = detector.displayName ?? detector.id ?? '—';

        return new ymaps.Placemark([detector.lat, detector.lon], {
            balloonContent: `
                <b>Детектор ${name}</b><br/>
                ТС: ${vehicleStr}<br/>
                Время: ${timeStr}<br/>
                Скорость: ${speedStr}
            `,
            name: `Detector ${name}`,
            detectorId: detector.id
        }, {
            preset: 'islands#blueIcon'
        });
    });

    placemarks.forEach(pm => window.collections.detectors.add(pm));

    try {
        const bounds = window.clusterer.getBounds();
        if (bounds) {
            window.map.setBounds(bounds, {
                checkZoomRange: true,
                zoomMargin: 40
            });
        }
    } catch (e) {
        console.warn('setBounds failed:', e);
    }
}

function showConvoysOnMap() {
    initCollections();
    if (!window.clusterer || !window.convoyData || !window.convoyData.length) {
        console.warn('No convoy data or clusterer available');
        return;
    }

    // Clear only convoy markers, keep other collections
    window.collections.convoys.removeAll();

    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];

    window.convoyData.forEach((convoy, i) => {
        const color = colors[i % colors.length];

        convoy.commonDetectors.forEach(detectorId => {
            const detector = window.allDetectorsData.find(d => d.id === String(detectorId));
            if (detector) {
                const name = detector.displayName ?? detector.id ?? '—';
                const placemark = new ymaps.Placemark([detector.lat, detector.lon], {
                    balloonContent: `
                        <b>КОНВОЙ #${i + 1}</b><br/>
                        <b>Детектор ${name}</b><br/>
                        Машины: ${convoy.vehicles.join(', ')}<br/>
                        Длительность: ${convoy.durationMinutes} мин<br/>
                        Общих детекторов: ${convoy.commonDetectorsCount}
                    `
                }, {
                    preset: 'islands#circleIcon',
                    iconColor: color,
                    iconOpacity: 1.0
                });

                window.collections.convoys.add(placemark);
            }
        });
    });

    try {
        const bounds = window.clusterer.getBounds();
        if (bounds) {
            window.map.setBounds(bounds, {
                checkZoomRange: true,
                zoomMargin: 40
            });
        }
    } catch (e) {
        console.warn('setBounds failed:', e);
    }
}

// Update visualizeRoutes function
function visualizeRoutes(routeStats) {
    initCollections();
    if (!window.map || !routeStats || !routeStats.length) return;

    // Clear only route lines, keep other collections
    window.collections.routes.removeAll();

    const maxIntensity = Math.max(...routeStats.map(r => r.intensity || 0), 1);

    routeStats.forEach((route, index) => {
        if (!route.coordinates || !route.coordinates.length) return;

        const intensityRatio = (route.intensity || 0) / maxIntensity;
        const color = getColorForIntensity(intensityRatio);
        const width = 2 + intensityRatio * 8;

        const polyline = new ymaps.Polyline(route.coordinates, {
            balloonContent: `
                <b>Маршрут ${index + 1}</b><br>
                ТС: ${route.vehicleCount || 0}<br>
                Интенсивность: ${(route.intensity || 0).toFixed(1)} ТС/час<br>
                Ср. скорость: ${(route.avgSpeed || 0).toFixed(1)} км/ч<br>
                Ср. время: ${(route.avgTime || 0).toFixed(1)} мин
            `
        }, {
            strokeColor: color,
            strokeWidth: width,
            strokeOpacity: 0.8
        });

        window.collections.routes.add(polyline);
    });

    try {
        const bounds = window.collections.routes.getBounds();
        if (bounds) {
            window.map.setBounds(bounds, {
                checkZoomRange: true,
                zoomMargin: 40
            });
        }
    } catch (e) {
        console.warn('setBounds failed:', e);
    }
}

// Добавляем кнопки для переключения режимов
function addViewButtons() {
    const buttonContainer = document.createElement('div');
    buttonContainer.style.margin = '10px 0';
    buttonContainer.innerHTML = `
        <button onclick="toggleViewMode('all')" style="margin-right: 5px;">Все детекторы</button>
        <button onclick="toggleViewMode('convoys')">Показать конвои</button>
    `;

    const statusElement = document.getElementById('fileInfo1');
    statusElement.parentNode.insertBefore(buttonContainer, statusElement.nextSibling);
}

function addTimeRangeControls() {
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'analysis-controls';
    controlsContainer.innerHTML = `
        <div class="time-range">
            <h4>Анализ загруженности маршрутов</h4>
            <div>
                <label>Начало: <input type="time" id="routeStartTime" value="00:00"></label>
                <label>Конец: <input type="time" id="routeEndTime" value="23:59"></label>
                <label>Топ маршрутов: <input type="number" id="topRoutesCount" value="10" min="1" max="50"></label>
            </div>
            <button onclick="analyzeTimeRange()">Анализировать</button>
        </div>
    `;

    const sidebar = document.querySelector('.sidebar');
    sidebar.appendChild(controlsContainer);
}

// Add this function to handle time range analysis
async function analyzeTimeRange() {
    const startTime = document.getElementById('routeStartTime').value;
    const endTime = document.getElementById('routeEndTime').value;
    const topN = parseInt(document.getElementById('topRoutesCount').value) || 10;

    if (!window.allDetectorsData.length) {
        alert('Сначала загрузите данные');
        return;
    }

    const analyzer = new TrafficConvoyAnalyzer(window.allDetectorsData);
    const filteredData = analyzer.filterByTimeRange(startTime, endTime);
    const routeStats = analyzer.analyzeRoutes(filteredData, topN);

    // Visualize routes on map
    visualizeRoutes(routeStats);
}

// Helper function for route colors (clamped, returns full 6-char hex)
function getColorForIntensity(intensity) {
    const t = Math.max(0, Math.min(1, Number(intensity) || 0));
    const r = Math.round(t * 255);
    const g = Math.round((1 - t) * 255);
    const toHex = v => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}00`;
}

// New graph visualization functions
function visualizeConvoyGraph() {
    initCollections();
    if (!window.convoyData || !window.convoyData.length) {
        console.warn('No convoy data available for graph visualization');
        return;
    }

    // Clear existing graph collections
    if (window.collections.graphNodes) window.collections.graphNodes.removeAll();
    if (window.collections.graphEdges) window.collections.graphEdges.removeAll();

    // Initialize graph collections if not exist
    if (!window.collections.graphNodes) {
        window.collections.graphNodes = new ymaps.GeoObjectCollection({}, {
            preset: 'islands#greenIcon'
        });
        window.clusterer.add(window.collections.graphNodes);
    }
    if (!window.collections.graphEdges) {
        window.collections.graphEdges = new ymaps.GeoObjectCollection({}, {
            zIndex: 2000
        });
        window.clusterer.add(window.collections.graphEdges);
    }

    const analyzer = new TrafficConvoyAnalyzer(window.allDetectorsData.map(d => ({
        ID_детектора: d.id,
        Временная_метка: d.timestampISO,
        Идентификатор_ТС: d.vehicleId,
        Скорость_прохождения: d.speed,
        lat: d.lat,
        lon: d.lon
    })));
    analyzer.preprocessData();

    const graphData = analyzer.buildConvoyGraph(window.convoyData);

    // Add nodes (vehicles)
    graphData.nodes.forEach(node => {
        const placemark = new ymaps.Placemark([node.lat, node.lon], {
            balloonContent: `
                <b>ТС: ${node.id}</b><br/>
                Конвои: ${node.convoys.join(', ')}
            `
        }, {
            preset: 'islands#greenIcon',
            iconColor: '#32CD32'
        });
        window.collections.graphNodes.add(placemark);
    });

    // Add edges (connections between vehicles in convoys)
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    graphData.edges.forEach(edge => {
        const fromNode = graphData.nodes.find(n => n.id === edge.from);
        const toNode = graphData.nodes.find(n => n.id === edge.to);

        if (fromNode && toNode) {
            const polyline = new ymaps.Polyline([fromNode, toNode].map(n => [n.lat, n.lon]), {
                balloonContent: `
                    <b>Связь в конвое</b><br/>
                    От: ${edge.from}<br/>
                    К: ${edge.to}<br/>
                    Конвой: ${edge.convoyId + 1}
                `
            }, {
                strokeColor: colors[edge.convoyId % colors.length],
                strokeWidth: 3,
                strokeOpacity: 0.8
            });
            window.collections.graphEdges.add(polyline);
        }
    });

    try {
        const bounds = window.clusterer.getBounds();
        if (bounds) {
            window.map.setBounds(bounds, {
                checkZoomRange: true,
                zoomMargin: 40
            });
        }
    } catch (e) {
        console.warn('setBounds failed:', e);
    }
}

function visualizeRouteGraph() {
    initCollections();
    if (!window.routeStats || !window.routeStats.length) {
        console.warn('No route data available for graph visualization');
        return;
    }

    // Clear existing graph collections
    if (window.collections.graphNodes) window.collections.graphNodes.removeAll();
    if (window.collections.graphEdges) window.collections.graphEdges.removeAll();

    // Initialize graph collections if not exist
    if (!window.collections.graphNodes) {
        window.collections.graphNodes = new ymaps.GeoObjectCollection({}, {
            preset: 'islands#orangeIcon'
        });
        window.clusterer.add(window.collections.graphNodes);
    }
    if (!window.collections.graphEdges) {
        window.collections.graphEdges = new ymaps.GeoObjectCollection({}, {
            zIndex: 2000
        });
        window.clusterer.add(window.collections.graphEdges);
    }

    const analyzer = new TrafficConvoyAnalyzer(window.allDetectorsData.map(d => ({
        ID_детектора: d.id,
        Временная_метка: d.timestampISO,
        Идентификатор_ТС: d.vehicleId,
        Скорость_прохождения: d.speed,
        lat: d.lat,
        lon: d.lon
    })));
    analyzer.preprocessData();

    const graphData = analyzer.buildRouteGraph(window.routeStats);

    // Add nodes (detectors)
    graphData.nodes.forEach(node => {
        const placemark = new ymaps.Placemark([node.lat, node.lon], {
            balloonContent: `
                <b>Детектор: ${node.name}</b><br/>
                ID: ${node.id}
            `
        }, {
            preset: 'islands#orangeIcon',
            iconColor: '#FF8C00'
        });
        window.collections.graphNodes.add(placemark);
    });

    // Add edges (transitions between detectors)
    const maxWeight = Math.max(...graphData.edges.map(e => e.weight), 1);
    graphData.edges.forEach(edge => {
        const width = 2 + (edge.weight / maxWeight) * 8;
        const intensity = edge.weight / maxWeight;
        const color = getColorForIntensity(intensity);

        const polyline = new ymaps.Polyline(edge.coordinates, {
            balloonContent: `
                <b>Переход</b><br/>
                От: ${edge.from}<br/>
                К: ${edge.to}<br/>
                ТС: ${edge.weight}<br/>
                Ср. скорость: ${edge.avgSpeed.toFixed(1)} км/ч<br/>
                Ср. время: ${edge.avgTime.toFixed(1)} мин
            `
        }, {
            strokeColor: color,
            strokeWidth: width,
            strokeOpacity: 0.8
        });
        window.collections.graphEdges.add(polyline);
    });

    try {
        const bounds = window.clusterer.getBounds();
        if (bounds) {
            window.map.setBounds(bounds, {
                checkZoomRange: true,
                zoomMargin: 40
            });
        }
    } catch (e) {
        console.warn('setBounds failed:', e);
    }
}

function hideGraphs() {
    if (window.collections.graphNodes) window.collections.graphNodes.removeAll();
    if (window.collections.graphEdges) window.collections.graphEdges.removeAll();
}

// Initialize controls when page loads
document.addEventListener('DOMContentLoaded', function() {
    addViewButtons();
    addTimeRangeControls();
    addGraphControls();
    const simBtn = document.getElementById('simulateConvoyBtn');
    if (simBtn) {
        simBtn.addEventListener('click', () => simulateConvoys());
    }
});

// Add graph view controls
function addGraphControls() {
    const graphContainer = document.createElement('div');
    graphContainer.className = 'graph-controls';
    graphContainer.innerHTML = `
        <div class="section">
            <h3>6. Графы</h3>
            <button onclick="visualizeConvoyGraph()">Показать граф конвоев</button>
            <button onclick="visualizeRouteGraph()">Показать граф маршрутов</button>
            <button onclick="hideGraphs()">Скрыть графы</button>
        </div>
    `;

    const sidebar = document.querySelector('.sidebar');
    sidebar.appendChild(graphContainer);
}

function toggleViewMode(mode) {
    if (mode === 'all') {
        updateAllDetectorsOnMap();
    } else if (mode === 'convoys') {
        showConvoysOnMap();
    }
}

// --- Эмуляция конвоев (клиентская генерация тестовых данных) ---
function simulateConvoys(options = {}) {
    const cfg = Object.assign({
        detectorsCount: 12,
        convoysCount: 2,
        vehiclesPerConvoy: 3,
        loneVehicles: 2,
        baseTime: new Date(),
        interDetectorSec: 60,
        intraConvoyOffsetSec: 20,
        speedKmh: 40,
        jitterMeters: 30
    }, options);

    // Подготовим позиции детекторов: если не загружены, сгенерируем линейную «дорогу»
    window.detectorPositions = window.detectorPositions || {};
    const havePositions = Object.keys(window.detectorPositions).length > 0;
    const defaultCenter = { lat: 54.776103, lon: 32.056252 };

    const toRad = deg => deg * Math.PI / 180;
    const metersToDeg = (mLat, mLon, lat) => ({
        dLat: mLat / 111320,
        dLon: mLon / (111320 * Math.cos(toRad(lat)))
    });

    const detectorIds = [];
    if (!havePositions) {
        // Сгенерируем «улицу»: равномерно по прямой с легким поворотом
        const stepMeters = 300; // шаг между детекторами ~300 м
        let bearing = Math.PI / 12; // небольшой наклон
        for (let i = 0; i < cfg.detectorsCount; i++) {
            const offsetM = i * stepMeters;
            const dx = Math.cos(bearing) * offsetM;
            const dy = Math.sin(bearing) * offsetM;
            const { dLat, dLon } = metersToDeg(dy, dx, defaultCenter.lat);
            const lat = defaultCenter.lat + dLat;
            const lon = defaultCenter.lon + dLon;
            const id = `D${i + 1}`;
            window.detectorPositions[id] = { name: id, lat, lon };
            detectorIds.push(id);
        }
    } else {
        // Возьмем часть имеющихся детекторов
        const ids = Object.keys(window.detectorPositions);
        ids.slice(0, Math.max(cfg.detectorsCount, 2)).forEach(id => detectorIds.push(id));
        if (detectorIds.length < 2) {
            // safety: добавим искусственные
            for (let i = detectorIds.length; i < cfg.detectorsCount; i++) {
                const id = `D${i + 1}`;
                const lat = defaultCenter.lat + (Math.random() - 0.5) * 0.02;
                const lon = defaultCenter.lon + (Math.random() - 0.5) * 0.02;
                window.detectorPositions[id] = { name: id, lat, lon };
                detectorIds.push(id);
            }
        }
    }

    // Сконструируем маршруты: для каждого конвоя возьмем подпоследовательность детекторов
    const routes = [];
    const minLen = Math.max(4, Math.floor(detectorIds.length / 3));
    const maxLen = Math.max(minLen + 1, Math.floor(detectorIds.length / 2));
    for (let c = 0; c < cfg.convoysCount; c++) {
        const len = Math.floor(minLen + Math.random() * (maxLen - minLen + 1));
        const startIdx = Math.floor(Math.random() * Math.max(1, detectorIds.length - len));
        const seq = detectorIds.slice(startIdx, startIdx + len);
        routes.push(seq);
    }

    // Пара одиночных машин вне конвоев: короткие маршруты
    for (let l = 0; l < cfg.loneVehicles; l++) {
        const len = 2 + Math.floor(Math.random() * 2);
        const startIdx = Math.floor(Math.random() * Math.max(1, detectorIds.length - len));
        routes.push(detectorIds.slice(startIdx, startIdx + len));
    }

    const rows = [];
    let vehicleCounter = 1;

    const randJitter = (baseLat, baseLon) => {
        const jx = (Math.random() - 0.5) * cfg.jitterMeters;
        const jy = (Math.random() - 0.5) * cfg.jitterMeters;
        const { dLat, dLon } = metersToDeg(jy, jx, baseLat);
        return [baseLat + dLat, baseLon + dLon];
    };

    // Для каждого маршрута создаем группу ТС; для конвоев — синхронные времена с небольшими сдвигами
    routes.forEach((routeDetectors, routeIdx) => {
        const isConvoy = routeIdx < cfg.convoysCount;
        const groupSize = isConvoy ? cfg.vehiclesPerConvoy : 1;
        const convoyStart = new Date(cfg.baseTime.getTime() + routeIdx * 15 * 60 * 1000); // старт каждые 15 минут

        for (let k = 0; k < groupSize; k++) {
            const vehId = `V${vehicleCounter++}`;
            const offsetSec = isConvoy ? k * cfg.intraConvoyOffsetSec : Math.floor(Math.random() * 180);

            routeDetectors.forEach((detId, i) => {
                const pos = window.detectorPositions[detId];
                if (!pos) return;
                const t = new Date(convoyStart.getTime() + (i * cfg.interDetectorSec + offsetSec) * 1000);
                const [lat, lon] = randJitter(pos.lat, pos.lon);
                const speed = Math.max(20, Math.round(cfg.speedKmh + (Math.random() - 0.5) * 10));
                rows.push({
                    ID_детектора: detId,
                    Временная_метка: t.toISOString(),
                    Идентификатор_ТС: vehId,
                    Скорость_прохождения: speed,
                    lat,
                    lon
                });
            });
        }
    });

    // Сохраняем и проводим наш стандартный анализ
    window.rawEventRows = rows;
    window.allDetectorsData = normalizeDetectors(rows);

    const analyzer = new TrafficConvoyAnalyzer(window.allDetectorsData.map(d => ({
        ID_детектора: d.id,
        Временная_метка: d.timestampISO,
        Идентификатор_ТС: d.vehicleId,
        Скорость_прохождения: d.speed,
        lat: d.lat,
        lon: d.lon
    })));
    analyzer.preprocessData();
    window.convoyData = analyzer.findConvoys();

    updateAllDetectorsOnMap();

    const status = document.getElementById('fileInfo1') || document.getElementById('status');
    if (status) {
        status.textContent = `Смоделировано событий: ${rows.length}. ТС: ${new Set(rows.map(r => r.Идентификатор_ТС)).size}. Найдено конвоев: ${window.convoyData.length}`;
    }
}

window.TrafficConvoyAnalyzer = TrafficConvoyAnalyzer;
window.updateAllDetectorsOnMap = updateAllDetectorsOnMap;
window.showConvoysOnMap = showConvoysOnMap;
window.toggleViewMode = toggleViewMode;
window.visualizeConvoyGraph = visualizeConvoyGraph;
window.visualizeRouteGraph = visualizeRouteGraph;
window.hideGraphs = hideGraphs;
window.simulateConvoys = simulateConvoys;