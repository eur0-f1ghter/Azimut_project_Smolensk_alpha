class TrafficConvoyAnalyzer {
    constructor(data) {
        this.data = data;
        this.vehicleEvents = new Map();
        this.detectorEvents = new Map();
    }

    preprocessData() {
        console.log("Preprocessing data...");

        this.data.forEach(row => {
            const vehicle = row.Идентификатор_ТС;
            const timestamp = new Date(row.Временная_метка);

            if (!this.vehicleEvents.has(vehicle)) {
                this.vehicleEvents.set(vehicle, []);
            }
            this.vehicleEvents.get(vehicle).push({
                detector: row.ID_детектора,
                timestamp: timestamp,
                speed: row.Скорость_прохождения,
                lat: row.lat, // сохраняем координаты
                lon: row.lon  // сохраняем координаты
            });

            if (!this.detectorEvents.has(row.ID_детектора)) {
                this.detectorEvents.set(row.ID_детектора, []);
            }
            this.detectorEvents.get(row.ID_детектора).push({
                vehicle: vehicle,
                timestamp: timestamp,
                speed: row.Скорость_прохождения,
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

    // ... остальные методы класса без изменений ...
    findConvoys(maxTimeGap = 120, minCommonDetectors = 2, minConvoySize = 2) {
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

        this.detectorEvents.forEach((events, detectorId) => {
            for (let i = 0; i < events.length; i++) {
                const event1 = events[i];
                for (let j = i + 1; j < events.length; j++) {
                    const event2 = events[j];

                    const timeDiff = (event2.timestamp - event1.timestamp) / 1000;
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

            const detectors1 = new Set(this.vehicleEvents.get(v1).map(e => e.detector));
            const detectors2 = new Set(this.vehicleEvents.get(v2).map(e => e.detector));
            const commonDetectors = [...detectors1].filter(x => detectors2.has(x));

            if (commonDetectors.length >= minCommon) {
                let validCommon = 0;

                commonDetectors.forEach(detector => {
                    const time1 = this.vehicleEvents.get(v1).find(e => e.detector === detector).timestamp;
                    const time2 = this.vehicleEvents.get(v2).find(e => e.detector === detector).timestamp;

                    if (Math.abs(time1 - time2) / 1000 <= 120) {
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
        const start = new Date(startTime);
        const end = new Date(endTime);

        return this.data.filter(record => {
            const timestamp = new Date(record.Временная_метка);
            return timestamp >= start && timestamp <= end;
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
            intensity: data.count / ((end - start) / 1000 / 3600), // vehicles per hour
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
}

// Initialize collections on map load
ymaps.ready(() => {
    if (window.map && window.clusterer) {
        Object.values(window.collections).forEach(collection => {
            window.clusterer.add(collection);
        });
    }
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
        if (name && Number.isFinite(lat) && Number.isFinite(lon)) {
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

function updateMap(convoys, detectorData) {
    // ПРОВЕРКА: если clusterer не доступен, ждем инициализации
    if (!window.clusterer) {
        console.warn('Clusterer not ready, waiting...');
        setTimeout(() => updateMap(convoys, detectorData), 100);
        return;
    }

    if (!clusterer) {
        console.error('Кластерер не инициализирован');
        return;
    }

    clusterer.removeAll();

    const placemarks = [];
    convoys.forEach((convoy, i) => {
        convoy.commonDetectors.forEach(detectorId => {
            const detector = detectorData.find(d => d.ID_детектора === detectorId);
            if (detector) {
                placemarks.push(new ymaps.Placemark([detector.lat, detector.lon], {
                    balloonContent: `
                        <b>Детектор ${detectorId}</b><br/>
                        Конвой #${i + 1}<br/>
                        Машины: ${convoy.vehicles.join(', ')}<br/>
                        Длительность: ${convoy.durationMinutes} мин
                    `,
                    name: `Detector ${detectorId}`,
                    lat: detector.lat,
                    lon: detector.lon
                }, {
                    preset: 'islands#icon',
                    iconColor: `#${Math.floor(Math.random()*16777215).toString(16)}`
                }));
            }
        });
    });

    clusterer.add(placemarks);

    if (placemarks.length > 0 && window.map) {
        map.setBounds(clusterer.getBounds(), {
            checkZoomRange: true,
            zoomMargin: 40
        });
    }
}

function updateAllDetectorsOnMap() {
    // ПРОВЕРКА: если clusterer не доступен, ждем инициализации
    if (!window.clusterer) {
        console.warn('Clusterer not ready, waiting...');
        setTimeout(updateAllDetectorsOnMap, 100);
        return;
    }

    if (!clusterer || !window.allDetectorsData) return;

    clusterer.removeAll();

    const placemarks = window.allDetectorsData.map(detector => {
        return new ymaps.Placemark([detector.lat, detector.lon], {
            balloonContent: `
                <b>Детектор ${detector.ID_детектора}</b><br/>
                ТС: ${detector.Идентификатор_ТС}<br/>
                Время: ${new Date(detector.Временная_метка).toLocaleString()}<br/>
                Скорость: ${detector.Скорость_прохождения} км/ч
            `,
            name: `Detector ${detector.ID_детектора}`,
            lat: detector.lat,
            lon: detector.lon
        }, {
            preset: 'islands#icon',
            iconColor: '#2b7ff7'
        });
    });

    clusterer.add(placemarks);

    if (placemarks.length > 0 && window.map) {
        map.setBounds(clusterer.getBounds(), {
            checkZoomRange: true,
            zoomMargin: 40
        });
    }
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
        const resp = await fetch('http://localhost:5000/upload/convoy', {
            method: 'POST',
            body: formData
        });

        if (!resp.ok) {
            throw new Error(`Upload failed: ${resp.statusText}`);
        }

        const data = await resp.json();

        const analyzer = new TrafficConvoyAnalyzer(data.detectors);
        analyzer.preprocessData();
        const convoys = analyzer.findConvoys();

        // Store convoy data globally
        window.convoyData = convoys;
        window.allDetectorsData = data.detectors; // Сохраняем данные глобально

        // Обновляем карту с проверкой готовности
        if (window.clusterer) {
            updateAllDetectorsOnMap();
        } else {
            console.warn('Clusterer not ready, data saved for later use');
            // Данные сохранены в window.convoyData, можно обновить карту позже
        }

        status.textContent = `Найдено конвоев: ${convoys.length}`;

    } catch (e) {
        console.error('Error:', e);
        status.textContent = `Ошибка: ${e.message}`;
    }
});

// Функция для безопасного доступа к clusterer
function ensureClusterer(callback) {
    if (window.clusterer) {
        callback();
    } else {
        console.warn('Waiting for clusterer initialization...');
        setTimeout(() => ensureClusterer(callback), 100);
    }
}

// Export for other modules
window.TrafficConvoyAnalyzer = TrafficConvoyAnalyzer;
window.updateMap = updateMap;
window.updateAllDetectorsOnMap = updateAllDetectorsOnMap;

function showConvoysOnMap() {
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
        window.map.setBounds(window.clusterer.getBounds(), {
            checkZoomRange: true,
            zoomMargin: 40
        });
    } catch (e) {
        console.warn('setBounds failed:', e);
    }
}

// Update visualizeRoutes function
function visualizeRoutes(routeStats) {
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

// Add new methods to TrafficConvoyAnalyzer class
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

// Initialize controls when page loads
document.addEventListener('DOMContentLoaded', function() {
    addViewButtons();
    addTimeRangeControls();
});

window.TrafficConvoyAnalyzer = TrafficConvoyAnalyzer;
window.updateAllDetectorsOnMap = updateAllDetectorsOnMap;
window.showConvoysOnMap = showConvoysOnMap;
window.toggleViewMode = toggleViewMode;