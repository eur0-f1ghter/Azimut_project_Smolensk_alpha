// Основные переменные
let map;
let markers = [];
let popup = null;
let currentFilter = 'all';

// Координаты Смоленска (формат [lng, lat] — важно!)
const SMOLENSK_CENTER = [32.0453, 54.7826];

// Ограничения области показа карты (в градусах, lat/lng)
const MAP_BOUNDS = {
    north: 70.0,
    south: 40.0,
    west: 19.0,
    east: 40.0
};

// Вспомогательная: зафиксировать координату внутри MAP_BOUNDS
function clampToBounds([lng, lat]) {
    const clampedLng = Math.min(Math.max(lng, MAP_BOUNDS.west), MAP_BOUNDS.east);
    const clampedLat = Math.min(Math.max(lat, MAP_BOUNDS.south), MAP_BOUNDS.north);
    return [clampedLng, clampedLat];
}

// Автоцентровка на Смоленск
function autoCenterToSmolensk() {
    const center = clampToBounds(SMOLENSK_CENTER);
    if (map && typeof map.flyTo === 'function') {
        map.flyTo({
            center,
            zoom: 13,
            duration: 1500
        });
    } else if (map) {
        map.setCenter(center);
        map.setZoom(13);
    }
}

// Данные о происшествиях в Смоленске
// ВНИМАНИЕ: координаты записаны в формате [lng, lat]
const accidentsData = [
    { id: 1, coordinates: [32.0453, 54.7826], type: 'Столкновение', severity: 'high', description: 'Столкновение двух легковых автомобилей', time: '15 минут назад', address: 'ул. Большая Советская, 15' },
    { id: 2, coordinates: [32.0487, 54.7789], type: 'Наезд', severity: 'medium', description: 'Наезд на пешехода на пешеходном переходе', time: '30 минут назад', address: 'ул. Октябрьской революции, 5' },
    { id: 3, coordinates: [32.0524, 54.7862], type: 'Опрокидывание', severity: 'high', description: 'Опрокидывание грузового автомобиля', time: '1 час назад', address: 'пр. Гагарина, 12' },
    { id: 4, coordinates: [32.0386, 54.7801], type: 'Столкновение', severity: 'low', description: 'Незначительное столкновение на парковке', time: '2 часа назад', address: 'ул. Ленина, 8' },
    { id: 5, coordinates: [32.0425, 54.7756], type: 'Наезд', severity: 'medium', description: 'Наезд на ограждение', time: '3 часа назад', address: 'ул. Дзержинского, 20' },
    { id: 6, coordinates: [32.0350, 54.7890], type: 'Столкновение', severity: 'high', description: 'Лобовое столкновение', time: '5 часов назад', address: 'ул. Кирова, 22' },
    { id: 7, coordinates: [32.0588, 54.7843], type: 'Наезд', severity: 'low', description: 'Наезд на препятствие', time: '6 часов назад', address: 'ул. Багратиона, 15' },
    { id: 8, coordinates: [32.0480, 54.7710], type: 'Опрокидывание', severity: 'high', description: 'Опрокидывание автобуса', time: '8 часов назад', address: 'ул. Николаева, 28' },
    { id: 9, coordinates: [32.0550, 54.7795], type: 'Столкновение', severity: 'medium', description: 'Столкновение на перекрестке', time: '10 часов назад', address: 'пл. Ленина' },
    { id: 10, coordinates: [32.0420, 54.7870], type: 'Наезд', severity: 'low', description: 'Наезд на бордюр', time: '12 часов назад', address: 'ул. Тухачевского, 7' },
];

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    initEventListeners();
    renderIncidentsList();
    updateStats();
    updateLastUpdateTime();
});

// Инициализация карты
function initMap() {
    // Устанавливаем центр на Смоленск (и ограничиваем его)
    const initialCenter = clampToBounds(SMOLENSK_CENTER);

    map = new mapgl.Map('map', {
        center: initialCenter,
        zoom: 13,
        key: '37ce27af-2f55-493a-996f-f4d3d50036b9' // Замените на свой ключ
    });

    // Добавляем маркеры на карту после её загрузки
    map.on('load', () => {
        addMarkersToMap();
    });
}

// Инициализация обработчиков событий
function initEventListeners() {
    // Обработчики для кнопок управления картой
    const zoomInBtn = document.getElementById('zoom-in');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => map.setZoom(map.getZoom() + 1));

    const zoomOutBtn = document.getElementById('zoom-out');
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => map.setZoom(map.getZoom() - 1));

    const currentLocationBtn = document.getElementById('current-location');
    if (currentLocationBtn) {
        currentLocationBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        // Правильный порядок: [lng, lat]
                        const lng = position.coords.longitude;
                        const lat = position.coords.latitude;
                        const clamped = clampToBounds([lng, lat]);
                        map.setCenter(clamped);
                        map.setZoom(15);
                    },
                    (error) => {
                        alert('Не удалось определить ваше местоположение');
                    }
                );
            } else {
                alert('Геолокация не поддерживается вашим браузером');
            }
        });
    }

    const resetViewBtn = document.getElementById('reset-view');
    if (resetViewBtn) resetViewBtn.addEventListener('click', () => {
        map.setCenter(clampToBounds(SMOLENSK_CENTER));
        map.setZoom(13);
    });

    // Обработчики для кнопок фильтрации
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            filterIncidents(currentFilter);
        });
    });

    // Кнопка для принудительной центровки на Смоленск
    const centerSmolenskBtn = document.getElementById('center-smolensk');
    if (centerSmolenskBtn) {
        centerSmolenskBtn.addEventListener('click', autoCenterToSmolensk);
    }
}

// Добавление маркеров на карту
function addMarkersToMap() {
    // Очищаем существующие маркеры
    clearMarkers();
    // Фильтруем данные в зависимости от выбранного фильтра
    const filteredData = filterAccidentsData(accidentsData, currentFilter);

    filteredData.forEach(accident => {

        const markerElement = document.createElement('div');
        markerElement.className = 'accident-marker';
        markerElement.innerHTML = `
            <div style="
                width: 28px; 
                height: 28px; 
                border-radius: 50%; 
                background: ${getSeverityColor(accident.severity)}; 
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 14px;">
                <i class="fas fa-${getIncidentIcon(accident.type)}"></i>
            </div>
        `;

        // Убедимся, что координаты безопасны и в формате [lng, lat]
        const markerCoords = clampToBounds(accident.coordinates);

        const marker = new mapgl.Marker(map, {
            coordinates: markerCoords,
            element: markerElement
        });
        markers.push({ marker, data: accident });

        // Добавляем popup при клике на маркер
        markerElement.addEventListener('click', () => {
            if (popup) {
                popup.destroy();
                popup = null;
            }

            popup = new mapgl.Popup(map, {
                coordinates: markerCoords,
                offset: [0, -35],
                content: createPopupContent(accident)
            });

            // Закрытие popup при следующем клике (одноразовое)
            markerElement.addEventListener('click', () => {
                if (popup) {
                    popup.destroy();
                    popup = null;
                }
            }, { once: true });
        });
    });
}

// Создание содержимого для popup
function createPopupContent(accident) {
    return `
        <div class="accident-popup">
            <h3>${accident.type}</h3>
            <p>${accident.description}</p>
            <p><i class="fas fa-map-marker-alt"></i> ${accident.address}</p>
            <p><i class="far fa-clock"></i> ${accident.time}</p>
            <span class="severity ${accident.severity}">${getSeverityText(accident.severity)}</span>
        </div>
    `;
}

// Очистка маркеров с карты
function clearMarkers() {
    markers.forEach(({ marker }) => {
        try {
            marker.destroy();
        } catch (e) {
            // безопасно игнорируем ошибки удаления
        }
    });
    markers = [];
}

// Фильтрация данных о происшествиях
function filterAccidentsData(data, filter) {
    switch(filter) {
        case 'today':
            return data.filter(acc => acc.time.includes('минут') || acc.time.includes('час'));
        case 'serious':
            return data.filter(acc => acc.severity === 'high');
        case 'center':
            // Фильтр для центра города (примерные координаты центра Смоленска)
            return data.filter(acc => {
                const lng = acc.coordinates[0];
                const lat = acc.coordinates[1];
                return lat > 54.775 && lat < 54.79 && lng > 32.03 && lng < 32.06;
            });
        default:
            return data;
    }
}

// Фильтрация происшествий
function filterIncidents(filter) {
    currentFilter = filter;
    addMarkersToMap();
    renderIncidentsList();
    updateStats();
}

// Отображение списка происшествий
function renderIncidentsList() {
    const incidentList = document.getElementById('incident-list');
    if (!incidentList) return;
    incidentList.innerHTML = '';

    const filteredData = filterAccidentsData(accidentsData, currentFilter);

    if (filteredData.length === 0) {
        incidentList.innerHTML = '<div class="no-incidents">Нет происшествий по выбранному фильтру</div>';
        return;
    }

    filteredData.forEach(accident => {
        const incidentItem = document.createElement('div');
        incidentItem.className = 'incident-item';
        incidentItem.innerHTML = `
            <h3><i class="fas fa-${getIncidentIcon(accident.type)}"></i> ${accident.type}</h3>
            <p>${accident.description}</p>
            <p class="incident-address"><i class="fas fa-map-marker-alt"></i> ${accident.address}</p>
            <p><i class="far fa-clock"></i> ${accident.time}</p>
            <span class="severity ${accident.severity}">${getSeverityText(accident.severity)}</span>
        `;

        incidentItem.addEventListener('click', () => {
            const coords = clampToBounds(accident.coordinates);
            map.setCenter(coords);
            map.setZoom(16);

            // Показываем popup при клике на элемент списка
            if (popup) {
                popup.destroy();
                popup = null;
            }

            popup = new mapgl.Popup(map, {
                coordinates: coords,
                offset: [0, -35],
                content: createPopupContent(accident)
            });
        });

        incidentList.appendChild(incidentItem);
    });
}

// Обновление статистики
function updateStats() {
    const filteredData = filterAccidentsData(accidentsData, currentFilter);

    const totalEl = document.getElementById('total-accidents');
    const todayEl = document.getElementById('today-accidents');
    const seriousEl = document.getElementById('serious-accidents');

    if (totalEl) totalEl.textContent = filteredData.length;
    if (todayEl) todayEl.textContent = accidentsData.filter(acc =>
        acc.time.includes('минут') || acc.time.includes('час')).length;
    if (seriousEl) seriousEl.textContent = accidentsData.filter(acc =>
        acc.severity === 'high').length;
}

// Обновление времени последнего обновления
function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    const updateEl = document.getElementById('update-time');
    if (updateEl) updateEl.textContent = timeString;
}

// Получение иконки для типа происшествия
function getIncidentIcon(type) {
    switch(type) {
        case 'Столкновение': return 'car-crash';
        case 'Наезд': return 'user';
        case 'Опрокидывание': return 'bus';
        default: return 'exclamation-triangle';
    }
}

// Получение цвета для степени тяжести
function getSeverityColor(severity) {
    switch(severity) {
        case 'high': return '#ff6b6b';
        case 'medium': return '#f9ca24';
        case 'low': return '#a4b0be';
        default: return '#a4b0be';
    }
}

// Получение текста для степени тяжести
function getSeverityText(severity) {
    switch(severity) {
        case 'high': return 'Высокая тяжесть';
        case 'medium': return 'Средняя тяжесть';
        case 'low': return 'Низкая тяжесть';
        default: return 'Неизвестно';
    }
}

// Симуляция обновления данных (в реальном приложении будет AJAX-запрос)
setInterval(() => {
    updateLastUpdateTime();
}, 60000); // Обновляем время каждую минуту
