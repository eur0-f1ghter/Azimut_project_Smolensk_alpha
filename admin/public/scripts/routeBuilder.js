function createRouteFromDetectors(detectorsData, routeConfig = {}) {
    const {
        color = '#FF6B6B',
        width = 4,
        showMarkers = true,
        routeName = 'Автомаршрут'
    } = routeConfig;

    if (!window.map || !detectorsData.length) return null;

    const geoObjects = [];
    const coordinates = [];

    // Сортируем по времени если есть временные метки
    const sortedDetectors = detectorsData.slice().sort((a, b) => {
        if (a.timestamp && b.timestamp) {
            return new Date(a.timestamp) - new Date(b.timestamp);
        }
        return 0;
    });

    // Создаем маршрут
    sortedDetectors.forEach((detector, index) => {
        coordinates.push([detector.lat, detector.lon]);

        if (showMarkers) {
            const placemark = new ymaps.Placemark([detector.lat, detector.lon], {
                balloonContent: `
                    <b>${detector.detector || detector.ID_детектора || 'Точка'}</b>
                    ${detector.vehicle ? `<br/>ТС: ${detector.vehicle}` : ''}
                    ${detector.timestamp ? `<br/>Время: ${new Date(detector.timestamp).toLocaleString()}` : ''}
                    ${detector.speed ? `<br/>Скорость: ${detector.speed} км/ч` : ''}
                `
            }, {
                preset: 'islands#circleIcon',
                iconColor: index === 0 ? '#4ECDC4' :
                          index === sortedDetectors.length - 1 ? '#FF6B6B' : '#2b7ff7',
                iconCaption: detector.detector || `${index + 1}`
            });

            geoObjects.push(placemark);
        }
    });

    // Создаем линию маршрута
    if (coordinates.length > 1) {
        const polyline = new ymaps.Polyline(coordinates, {
            balloonContent: `
                <b>${routeName}</b><br/>
                Точек: ${coordinates.length}<br/>
                ${sortedDetectors[0].timestamp ? `Начало: ${new Date(sortedDetectors[0].timestamp).toLocaleString()}` : ''}
            `
        }, {
            strokeColor: color,
            strokeWidth: width,
            strokeOpacity: 0.8
        });

        geoObjects.push(polyline);
    }

    // Добавляем на карту
    geoObjects.forEach(obj => window.map.geoObjects.add(obj));

    // Подбираем масштаб
    const bounds = window.map.geoObjects.getBounds();
    if (bounds) {
        window.map.setBounds(bounds, {
            checkZoomRange: true,
            zoomMargin: 40
        });
    }

    return geoObjects;
}

// Функция для создания маршрута из загруженных данных
function buildRouteFromUploadedData() {
    if (!window.allDetectorsData || !window.allDetectorsData.length) {
        alert('Сначала загрузите данные детекторов');
        return;
    }

    // Очищаем предыдущие маршруты
    clearRoutes();

    // Создаем маршрут из всех детекторов
    const route = createRouteFromDetectors(window.allDetectorsData, {
        color: '#4ECDC4',
        width: 6,
        routeName: 'Маршрут по детекторам'
    });

    if (route) {
        console.log('Маршрут создан:', route.length, 'объектов');
    }
}

// Функция для очистки маршрутов
function clearRoutes() {
    if (window.map) {
        // Удаляем все геообъекты кроме кластеров
        const geoObjects = window.map.geoObjects;
        const toRemove = [];

        geoObjects.each(obj => {
            // Проверяем, является ли объект маршрутом (не кластером)
            if (obj instanceof ymaps.Polyline || obj instanceof ymaps.Placemark) {
                // Проверяем, не является ли это частью кластера
                if (!obj.options.get('clusterCaption')) {
                    toRemove.push(obj);
                }
            }
        });

        toRemove.forEach(obj => geoObjects.remove(obj));
    }
}

// Экспортируем функции для глобального доступа
window.createRouteFromDetectors = createRouteFromDetectors;
window.buildRouteFromUploadedData = buildRouteFromUploadedData;
window.clearRoutes = clearRoutes;
