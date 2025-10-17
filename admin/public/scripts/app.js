class TrafficAnalyzerApp {
    constructor() {
        this.map = null;
        this.clusterer = null;
        this.routeAnalyzer = null; // для популярных маршрутов
        this.routeVisualizer = null; // для визуализации маршрутов

        this.initMap();
        this.bindEvents();
    }

    initMap() {
        ymaps.ready(() => {
            this.map = new ymaps.Map("map", {
                center: [54.7761, 32.0563],
                zoom: 10
            });
            this.clusterer = new ymaps.Clusterer({
                preset: 'islands#invertedClusterIcons'
            });
            this.map.geoObjects.add(this.clusterer);
        });

    }

    bindEvents() {
        // Здесь привяжите обработку загрузки файлов:
        document.getElementById('uploadBtn1').addEventListener('click', () => this.handleFileUpload());
        document.getElementById('analyzeRoutesBtn').addEventListener('click', () => this.analyzePopularRoutes());
    }

    async handleFileUpload() {
        const fileInput = document.getElementById('fileInput1');
        const status = document.getElementById('fileInfo1');

        if (!fileInput.files || !fileInput.files[0]) {
            status.textContent = 'Выберите файл (CSV/XLSX)';
            return;
        }
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('file', file);

        status.textContent = 'Загружаю данные...';

        try {
            const resp = await fetch('http://localhost:5001/upload/convoy', {
                method: 'POST',
                body: formData
            });

            if (!resp.ok) {
                const txt = await resp.text();
                throw new Error(`Ошибка загрузки: ${resp.status} ${resp.statusText} ${txt}`);
            }

            const data = await resp.json();

            // Если загружен файл позиций (Name, Latitude, Longitude)
            const rows = data.detectors || [];
            const first = rows[0] || {};
            const hasPos = Object.keys(first).some(k => /lat|latitude|longitude|Longitude|Latitude/i.test(k));
            const hasName = Object.keys(first).some(k => /name|Name/i.test(k));
            const hasTime = Object.keys(first).some(k => /Временная_метка|timestamp/i.test(k));

            if (hasPos && hasName && !hasTime) { // файл с позициями
                normalizePositions(rows);
                status.textContent = `Импортировано позиций: ${Object.keys(window.detectorPositions).length}`;
                // Если есть уже событие, можно обновить points:
                if (window.rawEventRows) {
                    window.allDetectorsData = normalizeDetectors(window.rawEventRows);
                    this.showAllDetectors();
                }
                return;
            }

            // Иначе файл с событиями
            window.rawEventRows = rows;
            window.allDetectorsData = normalizeDetectors(rows);
            // Вызываем метод для обновления карты
            this.showAllDetectors();
            status.textContent = `Загружено детекторов: ${window.allDetectorsData.length}`;
        } catch (e) {
            console.error('Ошибка:', e);
            status.textContent = `Ошибка: ${e.message}`;
        }
    }

    showAllDetectors() {
        if (!this.clusterer || !window.allDetectorsData || !window.allDetectorsData.length) {
            console.error("Нет данных детекторов или clusterer не инициализирован");
            return;
        }
        this.clusterer.removeAll();

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
                name: `Detector ${name}`
            }, {
                preset: 'islands#icon',
                iconColor: '#2b7ff7'
            });
        });

        this.clusterer.add(placemarks);
        try {
            this.map.setBounds(this.clusterer.getBounds(), { checkZoomRange: true, zoomMargin: 40 });
        } catch (e) {
            console.warn('setBounds failed:', e);
        }
    }

    async analyzePopularRoutes() {
        // Поле input для файла с данными популярных маршрутов и фильтры должны быть добавлены в HTML
        const fileInput = document.getElementById('routesFileInput');
        const status = document.getElementById('routesFileInfo');
        if (!fileInput.files || !fileInput.files[0]) {
            status.textContent = 'Выберите файл с данными маршрутов';
            return;
        }
        const startTime = document.getElementById('routeStartTime').value; // например "08:00"
        const endTime = document.getElementById('routeEndTime').value; // например "10:00"
        try {
            const stats = await window.analyzePopularRoutes(fileInput.files[0], startTime, endTime, 10);
            // Вывод результатов
            status.textContent = `Найдено популярных маршрутов: ${stats.length}`;
            window.visualizePopularRoutes(stats);
        } catch (err) {
            console.error(err);
            status.textContent = `Ошибка: ${err.message}`;
        }
    }
}

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    window.trafficApp = new TrafficAnalyzerApp();
});