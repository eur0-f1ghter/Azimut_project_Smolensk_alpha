    class RouteVisualizer {
    constructor(map, clusterer) {
        if (!map || !clusterer) {
            throw new Error('Map and clusterer are required for RouteVisualizer');
        }
        this.map = map;
        this.clusterer = clusterer;
        this.colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
        ];
    }

    visualizePopularRoutes(routeStats) {
        console.log('Визуализация популярных маршрутов...');

        // Проверяем, что clusterer инициализирован
        if (!this.clusterer) {
            console.error('Clusterer not initialized');
            return;
        }

        this.clusterer.removeAll();

        if (!routeStats || routeStats.length === 0) {
            console.log('Нет данных для визуализации');
            return;
        }

        const allPlacemarks = [];
        const allPolylines = [];

        routeStats.forEach((route, index) => {
            if (route.coordinates && route.coordinates.length > 0) {
                const color = this.colors[index % this.colors.length];

                // Создаем линию маршрута
                const polyline = this._createRoutePolyline(route, color, index);
                if (polyline) {
                    allPolylines.push(polyline);
                }

                // Создаем метки для детекторов
                const placemarks = this._createRoutePlacemarks(route, color, index);
                allPlacemarks.push(...placemarks);
            }
        });

        // Добавляем все объекты на карту
        this.clusterer.add(allPlacemarks);
        this.clusterer.add(allPolylines);

        // Автоматически подбираем масштаб
        this._fitMapToBounds();
    }

    _createRoutePolyline(route, color, index) {
        const coordinates = route.coordinates
            .filter(coord => coord.lat && coord.lon)
            .map(coord => [coord.lat, coord.lon]);

        if (coordinates.length < 2) return null;

        const strokeWidth = Math.max(3, Math.min(8, route.totalVehicles / 10));

        return new ymaps.Polyline(coordinates, {}, {
            strokeColor: color,
            strokeWidth: strokeWidth,
            strokeOpacity: 0.8,
            balloonContent: this._getRouteBalloonContent(route, index)
        });
    }

    _createRoutePlacemarks(route, color, index) {
        return route.coordinates
            .filter(coord => coord.lat && coord.lon)
            .map((coord, pointIndex) => {
                return new ymaps.Placemark([coord.lat, coord.lon], {
                    balloonContent: `
                        <b>Маршрут #${route.rank}</b><br/>
                        Детектор: ${coord.detector}<br/>
                        Позиция в маршруте: ${pointIndex + 1}/${route.routeLength}<br/>
                        Всего ТС: ${route.totalVehicles}<br/>
                        Интенсивность: ${route.intensityPerHour} ТС/час
                    `,
                    hintContent: `Маршрут #${route.rank} - ${coord.detector}`
                }, {
                    preset: 'islands#circleIcon',
                    iconColor: color,
                    iconCaption: `${route.rank}.${pointIndex + 1}`
                });
            });
    }

    _getRouteBalloonContent(route, index) {
        return `
            <div style="max-width: 300px;">
                <h3>Маршрут #${route.rank}</h3>
                <p><b>Детекторы:</b> ${route.route.join(' → ')}</p>
                <p><b>Длина:</b> ${route.routeLength} точек</p>
                <p><b>Транспортных средств:</b> ${route.totalVehicles}</p>
                <p><b>Интенсивность:</b> ${route.intensityPerHour} ТС/час</p>
                <p><b>Средняя скорость:</b> ${route.avgSpeedKmh} км/ч</p>
                <p><b>Среднее время:</b> ${route.avgDurationMin} мин</p>
            </div>
        `;
    }

    _fitMapToBounds() {
        setTimeout(() => {
            const bounds = this.clusterer.getBounds();
            if (bounds) {
                this.map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50 });
            }
        }, 500);
    }

    clearVisualization() {
        if (this.clusterer) {
            this.clusterer.removeAll();
        }
    }
}

window.RouteVisualizer = RouteVisualizer;