window.map = window.map || null;
window.clusterer = window.clusterer || null;
let detectorData = [];
let convoyData = [];

function updateMapPoints() {
    if (!clusterer) {
        console.error('Clusterer not initialized');
        return;
    }

    clusterer.removeAll();
    const placemarks = [];

    // Add detector points
    if (detectorData && detectorData.length > 0) {
        detectorData.forEach(detector => {
            placemarks.push(new ymaps.Placemark([detector.lat, detector.lon], {
                balloonContent: `
                    <b>Детектор ${detector.ID_детектора}</b><br/>
                    Координаты: ${detector.lat.toFixed(6)}, ${detector.lon.toFixed(6)}
                `,
                name: `Detector ${detector.ID_детектора}`,
                lat: detector.lat,
                lon: detector.lon
            }, {
                preset: 'islands#blueIcon'
            }));
        });
    }

    // Add convoy points
    if (convoyData && convoyData.length > 0) {
        convoyData.forEach((convoy, i) => {
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
                        name: `Convoy Detector ${detectorId}`,
                        lat: detector.lat,
                        lon: detector.lon
                    }, {
                        preset: 'islands#redIcon'
                    }));
                }
            });
        });
    }

    if (placemarks.length > 0) {
        clusterer.add(placemarks);
        map.setBounds(clusterer.getBounds(), {
            checkZoomRange: true,
            zoomMargin: 40
        });
    }
}

// Инициализация карты и кластеризатора
ymaps.ready(() => {
    map = new ymaps.Map('map', {
        center: [54.776103, 32.056252],
        zoom: 10
    });
    window.map = map;

    // Создаем кластеризатор
    clusterer = new ymaps.Clusterer({
        clusterDisableClickZoom: true,
        clusterOpenBalloonOnClick: true,
        clusterBalloonContentLayout: 'cluster#balloonCarousel',
        clusterBalloonItemContentLayout: ymaps.templateLayoutFactory.createClass(
            '<div style="margin: 5px;"><b>{{ properties.name || "Без имени" }}</b><br/>{{ properties.lat.toFixed(6) }}, {{ properties.lon.toFixed(6) }}</div>'
        )
    });
    window.clusterer = clusterer;

    map.geoObjects.add(clusterer);
    console.log('Карта и кластеризатор инициализированы');
});

document.getElementById('uploadBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    const status = document.getElementById('status');

    if (!fileInput.files || !fileInput.files[0]) {
        status.textContent = 'Выберите файл (CSV/XLSX)';
        return;
    }

    const file = fileInput.files[0];
    const form = new FormData();
    form.append('file', file);

    status.textContent = 'Загружаю...';

    try {
        const resp = await fetch('/upload', { method: 'POST', body: form });
        if (!resp.ok) {
            throw new Error(`Upload failed: ${resp.statusText}`);
        }

        const data = await resp.json();
        detectorData = data.detectors;
        updateMapPoints();

    } catch (e) {
        console.error('Error:', e);
        status.textContent = `Ошибка: ${e.message}`;
    }
});

document.getElementById('clearBtn').addEventListener('click', () => {
    if (clusterer) {
        clusterer.removeAll();
    }
    document.getElementById('status').textContent = '';
});