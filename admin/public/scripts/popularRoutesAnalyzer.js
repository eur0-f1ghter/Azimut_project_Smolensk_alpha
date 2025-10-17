// Требуется подключить xlsx.full.min.js в HTML для работы с Excel
class PopularRoutesAnalyzer {
    constructor(data) {
        this.data = data.map(row => {
            // Пытаемся заменить пробел в дате, если требуется
            let ts = row['Временная_метка'];
            if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)) {
                ts = ts.replace(' ', 'T');
            }
            row['Временная_метка'] = new Date(ts);
            return row;
        });
    }

    _filterByTime(startTime, endTime) {
        function toMinutes(t) {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        }
        const startM = toMinutes(startTime);
        const endM = toMinutes(endTime);
        return this.data.filter(row => {
            const d = row['Временная_метка'];
            if (!d || isNaN(d.getTime())) return false;
            const minutes = d.getHours() * 60 + d.getMinutes();
            return minutes >= startM && minutes <= endM;
        });
    }

    _extractAllRoutes(filteredData) {
        const routes = [];
        const vehicles = {};
        filteredData.forEach(row => {
            const veh = row['Идентификатор_ТС'];
            if (!vehicles[veh]) vehicles[veh] = [];
            vehicles[veh].push(row);
        });
        for (const veh in vehicles) {
            const vehicleData = vehicles[veh].sort((a, b) => a['Временная_метка'] - b['Временная_метка']);
            const detectors = vehicleData.map(r => r['ID_детектора']);
            const times = vehicleData.map(r => r['Временная_метка']);
            const speeds = vehicleData.map(r => {
                let sp = r['Скорость_прохождения'];
                return sp != null ? Number(String(sp).replace(',', '.')) : null;
            });
            if (detectors.length >= 2) {
                routes.push({
                    vehicle: veh,
                    route: detectors,
                    times: times,
                    speeds: speeds,
                    start_time: times[0],
                    end_time: times[times.length - 1]
                });
            }
        }
        return routes;
    }

    _findGuaranteedNRoutes(allRoutes, n_routes) {
        const routeCounter = {};
        allRoutes.forEach(rt => {
            const key = rt.route.join(',');
            routeCounter[key] = (routeCounter[key] || 0) + 1;
        });
        let fullRoutes = Object.entries(routeCounter)
            .map(([key, count]) => ({ route: key.split(','), count }));
        fullRoutes.sort((a, b) => b.count - a.count);
        if (fullRoutes.length >= n_routes) {
            return fullRoutes.slice(0, n_routes).map(r => r.route);
        }
        // Если уникальных маршрутов меньше — дополнить подмаршрутами
        const subrouteCounter = {};
        allRoutes.forEach(rt => {
            const r = rt.route;
            const len = r.length;
            const maxLen = Math.min(10, len);
            for (let L = 2; L <= maxLen; L++) {
                for (let i = 0; i <= len - L; i++) {
                    const sub = r.slice(i, i + L);
                    const key = sub.join(',');
                    subrouteCounter[key] = (subrouteCounter[key] || 0) + 1;
                }
            }
        });
        let subRoutes = Object.entries(subrouteCounter)
            .map(([key, count]) => ({ route: key.split(','), count }));
        subRoutes.sort((a, b) => b.count - a.count);
        const allCandidates = fullRoutes.concat(subRoutes);
        const unique = {};
        const candidates = [];
        allCandidates.forEach(item => {
            const key = item.route.join(',');
            if (!unique[key]) {
                unique[key] = true;
                candidates.push({ route: item.route, count: item.count });
            }
        });
        candidates.sort((a, b) => b.count - a.count);
        return candidates.slice(0, n_routes).map(c => c.route);
    }

    _containsSubsequence(mainRoute, subRoute) {
        if (subRoute.length > mainRoute.length) return false;
        let i = 0;
        for (const det of mainRoute) {
            if (det === subRoute[i]) i++;
            if (i === subRoute.length) return true;
        }
        return false;
    }

    _findVehiclesForRoute(targetRoute, filteredData) {
        const vehiclesData = [];
        const vehicles = {};
        filteredData.forEach(row => {
            const veh = row['Идентификатор_ТС'];
            if (!vehicles[veh]) vehicles[veh] = [];
            vehicles[veh].push(row);
        });
        for (const veh in vehicles) {
            const vehData = vehicles[veh].sort((a, b) => a['Временная_метка'] - b['Временная_метка']);
            const vehRoute = vehData.map(r => r['ID_детектора']);
            if (this._containsSubsequence(vehRoute, targetRoute))
                vehiclesData.push({
                    vehicle: veh,
                    route: vehRoute,
                    times: vehData.map(r => r['Временная_метка']),
                    speeds: vehData.map(r => Number(String(r['Скорость_прохождения']).replace(',', '.')))
                });
        }
        return vehiclesData;
    }

    _calculateAvgSpeed(vehiclesData) {
        let speeds = [];
        vehiclesData.forEach(vd => {
            speeds = speeds.concat(vd.speeds.filter(s => s != null));
        });
        return speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    }

    _calculateAvgDuration(vehiclesData) {
        let durations = [];
        vehiclesData.forEach(vd => {
            if (vd.times.length >= 2) {
                const diff = (vd.times[vd.times.length - 1] - vd.times[0]) / 60000;
                durations.push(diff);
            }
        });
        return durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    }

    findPopularRoutes(startTime, endTime, n_routes = 10) {
        console.log(`Поиск ${n_routes} популярных маршрутов с ${startTime} до ${endTime}`);
        const filtered = this._filterByTime(startTime, endTime);
        if (!filtered.length) return [];
        const allRoutes = this._extractAllRoutes(filtered);
        if (!allRoutes.length) return [];
        const popularRoutes = this._findGuaranteedNRoutes(allRoutes, n_routes);
        // Расчет статистики по каждому маршруту
        const stats = [];
        // Рассчитываем длительность периода в часах
        const periodHours = (datetimeFromHHMM(endTime) - datetimeFromHHMM(startTime)) / 3600000;
        popularRoutes.forEach((route, i) => {
            const vehiclesForRoute = this._findVehiclesForRoute(route, filtered);
            const totalVehicles = vehiclesForRoute.length;
            const intensity = periodHours > 0 ? totalVehicles / periodHours : 0;
            const avgSpeed = this._calculateAvgSpeed(vehiclesForRoute);
            const avgDuration = this._calculateAvgDuration(vehiclesForRoute);
            stats.push({
                rank: i + 1,
                route: route,
                totalVehicles: totalVehicles,
                intensityPerHour: Number(intensity.toFixed(2)),
                avgSpeedKmh: Number(avgSpeed.toFixed(2)),
                avgDurationMin: Number(avgDuration.toFixed(2)),
                routeLength: route.length
            });
        });
        return stats;
    }
}

function datetimeFromHHMM(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return new Date(1970, 0, 1, h, m);
}

// Функция для чтения Excel-файла и анализа популярных маршрутов
async function analyzePopularRoutes(file, startTime, endTime, nRoutes = 10) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = e.target.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheet = workbook.SheetNames[0];
                const sheet = workbook.Sheets[firstSheet];
                const jsonData = XLSX.utils.sheet_to_json(sheet);
                const analyzer = new PopularRoutesAnalyzer(jsonData);
                const stats = analyzer.findPopularRoutes(startTime, endTime, nRoutes);
                resolve(stats);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = err => reject(err);
        reader.readAsBinaryString(file);
    });
}

function visualizePopularRoutes(stats) {
    if (!window.map) return;
    if (!window._popularRouteCollection) {
        window._popularRouteCollection = new ymaps.GeoObjectCollection({}, { zIndex: 1000 });
        window.map.geoObjects.add(window._popularRouteCollection);
    }
    window._popularRouteCollection.removeAll();

    stats.forEach(stat => {
        const coords = [];
        // Используем window.detectorPositions для получения координат
        stat.route.forEach(detectorId => {
            const pos = window.detectorPositions ? window.detectorPositions[detectorId] : null;
            if (pos) {
                coords.push([pos.lat, pos.lon]);
            }
        });
        if (coords.length >= 2) {
            const polyline = new ymaps.Polyline(coords, {
                balloonContent: `
                    <b>Маршрут #${stat.rank}</b><br>
                    Детекторы: ${stat.route.join(' -> ')}<br>
                    ТС: ${stat.totalVehicles ?? stat.total_vehicles}<br>
                    Интенсивность: ${(stat.intensityPerHour ?? stat.intensity_per_hour)} ТС/час<br>
                    Ср. скорость: ${(stat.avgSpeedKmh ?? stat.avg_speed_kmh)} км/ч<br>
                    Ср. время: ${(stat.avgDurationMin ?? stat.avg_duration_min)} мин
                `
            }, {
                strokeColor: getColorForRank(stat.rank),
                strokeWidth: 3 + (stat.intensityPerHour ?? stat.intensity_per_hour),
                strokeOpacity: 0.8
            });
            window._popularRouteCollection.add(polyline);
        }
    });
    try {
        const bounds = window._popularRouteCollection.getBounds();
        if (bounds) {
            window.map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
        }
    } catch (e) {
        console.warn('setBounds failed:', e);
    }
}

function getColorForRank(rank) {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    return colors[(rank - 1) % colors.length];
}

// Store route stats globally for graph visualization
window.routeStats = [];

// Update analyzeTimeRange to store routeStats globally
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

    // Store globally for graph visualization
    window.routeStats = routeStats;

    // Visualize routes on map
    visualizeRoutes(routeStats);
}

window.analyzePopularRoutes = analyzePopularRoutes;
window.visualizePopularRoutes = visualizePopularRoutes;
window.analyzeTimeRange = analyzeTimeRange;
