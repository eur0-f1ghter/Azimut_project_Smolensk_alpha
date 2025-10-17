function analyzeLoadInTimeRange(startTime, endTime) {
    // Используем те же данные, что и для других анализов
    if (!window.allDetectorsData || window.allDetectorsData.length === 0) {
        throw new Error('No detector data loaded. Please upload data first.');
    }

    console.log(`Анализ загруженности с ${startTime} до ${endTime}`);

    try {
        // Используем анализатор популярных маршрутов
        const loadAnalyzer = new PopularRoutesAnalyzer(window.allDetectorsData);
        const popularRoutes = loadAnalyzer.findPopularRoutes(startTime, endTime, 10);

        // Возвращаем результаты для визуализации
        return {
            success: true,
            routes: popularRoutes,
            totalRoutes: popularRoutes.length,
            period: `${startTime} - ${endTime}`
        };

    } catch (error) {
        console.error('Error in load analysis:', error);
        return {
            success: false,
            error: error.message,
            routes: []
        };
    }
}

// Функция для кнопки анализа загруженности
function setupLoadAnalysis() {
    const analyzeLoadBtn = document.getElementById('analyzeLoadBtn');
    if (!analyzeLoadBtn) {
        console.warn('analyzeLoadBtn not found');
        return;
    }

    analyzeLoadBtn.addEventListener('click', () => {
        const start = document.getElementById('startTimeLoad').value;
        const end = document.getElementById('endTimeLoad').value;
        const status = document.getElementById('status');

        if (!start || !end) {
            status.textContent = 'Укажите временной диапазон';
            return;
        }

        try {
            status.textContent = 'Анализируем загруженность...';

            // Вызываем функцию анализа
            const result = analyzeLoadInTimeRange(start, end);

            if (result.success) {
                // Визуализируем результаты
                if (window.trafficApp && window.trafficApp.routeVisualizer) {
                    window.trafficApp.routeVisualizer.visualizePopularRoutes(result.routes);
                }

                // Показываем статистику
                showLoadStatistics(result.routes, start, end);

                status.textContent = `Проанализировано ${result.totalRoutes} маршрутов`;
            } else {
                status.textContent = `Ошибка: ${result.error}`;
            }

        } catch (error) {
            console.error('Ошибка анализа загруженности:', error);
            status.textContent = `Ошибка: ${error.message}`;
        }
    });
}

// Функция для отображения статистики загруженности
function showLoadStatistics(routes, startTime, endTime) {
    const resultsDiv = document.getElementById('loadResults');
    if (!resultsDiv) return;

    // Фильтруем маршруты с трафиком
    const routesWithTraffic = routes.filter(route => route.totalVehicles > 0);

    if (routesWithTraffic.length === 0) {
        resultsDiv.innerHTML = '<p>Нет данных о загруженности в указанный период</p>';
        return;
    }

    // Сортируем по интенсивности
    const sortedRoutes = [...routesWithTraffic].sort((a, b) => b.intensityPerHour - a.intensityPerHour);

    // Общая статистика
    const totalVehicles = sortedRoutes.reduce((sum, route) => sum + route.totalVehicles, 0);
    const avgIntensity = sortedRoutes.reduce((sum, route) => sum + route.intensityPerHour, 0) / sortedRoutes.length;

    resultsDiv.innerHTML = `
        <h4>Загруженность дорог (${startTime} - ${endTime})</h4>
        <div class="stats-summary">
            <strong>Общая статистика:</strong><br>
            • Всего транспортных средств: ${totalVehicles}<br>
            • Средняя интенсивность: ${avgIntensity.toFixed(1)} ТС/час<br>
            • Проанализировано маршрутов: ${sortedRoutes.length}
        </div>
        <div class="routes-list">
            <strong>Топ маршрутов по загруженности:</strong>
    `;

    sortedRoutes.slice(0, 10).forEach((route, index) => {
        const intensityLevel = getIntensityLevel(route.intensityPerHour);
        const intensityColor = getIntensityColor(intensityLevel);

        resultsDiv.innerHTML += `
            <div class="result-item" style="border-left: 4px solid ${intensityColor}" 
                 onclick="highlightRoute(${route.rank})">
                <strong>#${index + 1} ${intensityLevel}</strong><br>
                📊 Интенсивность: <strong>${route.intensityPerHour} ТС/час</strong><br>
                🚗 Транспортных средств: ${route.totalVehicles}<br>
                🛣️ Длина маршрута: ${route.routeLength} детекторов<br>
                💨 Средняя скорость: ${route.avgSpeedKmh} км/ч<br>
                <small>Маршрут: ${route.route.slice(0, 4).join(' → ')}${route.route.length > 4 ? '...' : ''}</small>
            </div>
        `;
    });

    resultsDiv.innerHTML += '</div>';
}

// Вспомогательные функции
function getIntensityLevel(intensity) {
    if (intensity > 40) return '🔥 ОЧЕНЬ ВЫСОКАЯ';
    if (intensity > 25) return '🔴 Высокая';
    if (intensity > 15) return '🟡 Средняя';
    if (intensity > 5) return '🟢 Низкая';
    return '⚪ Очень низкая';
}

function getIntensityColor(level) {
    switch(level) {
        case '🔥 ОЧЕНЬ ВЫСОКАЯ': return '#FF0000';
        case '🔴 Высокая': return '#FF6B6B';
        case '🟡 Средняя': return '#FFEAA7';
        case '🟢 Низкая': return '#4ECDC4';
        case '⚪ Очень низкая': return '#BDC3C7';
        default: return '#2b7ff7';
    }
}

// Функция для подсветки маршрута на карте
function highlightRoute(rank) {
    if (window.trafficApp && window.trafficApp.highlightRoute) {
        window.trafficApp.highlightRoute(rank);
    } else {
        console.log(`Подсветка маршрута #${rank}`);
    }
}

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    setupLoadAnalysis();
});