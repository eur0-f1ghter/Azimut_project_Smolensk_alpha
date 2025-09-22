// Основные переменные
let map;
let markers = [];
let popup = null;
let currentFilter = 'all';

// Координаты Смоленска
const SMOLENSK_CENTER = [54.7826, 32.0453];

// Данные о происшествиях в Смоленске
const accidentsData = [
    { id: 1, coordinates: [54.7826, 32.0453], type: 'Столкновение', severity: 'high', description: 'Столкновение двух легковых автомобилей', time: '15 минут назад', address: 'ул. Большая Советская, 15' },
    { id: 2, coordinates: [54.7789, 32.0487], type: 'Наезд', severity: 'medium', description: 'Наезд на пешехода на пешеходном переходе', time: '30 минут назад', address: 'ул. Октябрьской революции, 5' },
    { id: 3, coordinates: [54.7862, 32.0524], type: 'Опрокидывание', severity: 'high', description: 'Опрокидывание грузового автомобиля', time: '1 час назад', address: 'пр. Гагарина, 12' },
    { id: 4, coordinates: [54.7801, 32.0386], type: 'Столкновение', severity: 'low', description: 'Незначительное столкновение на парковке', time: '2 часа назад', address: 'ул. Ленина, 8' },
    { id: 5, coordinates: [54.7756, 32.0425], type: 'Наезд', severity: 'medium', description: 'Наезд на ограждение', time: '3 часа назад', address: 'ул. Дзержинского, 20' },
    { id: 6, coordinates: [54.7890, 32.0350], type: 'Столкновение', severity: 'high', description: 'Лобовое столкновение', time: '5 часов назад', address: 'ул. Кирова, 22' },
    { id: 7, coordinates: [54.7843, 32.0588], type: 'Наезд', severity: 'low', description: 'Наезд на препятствие', time: '6 часов назад', address: 'ул. Багратиона, 15' },
    { id: 8, coordinates: [54.7710, 32.0480], type: 'Опрокидывание', severity: 'high', description: 'Опрокидывание автобуса', time: '8 часов назад', address: 'ул. Николаева, 28' },
    { id: 9, coordinates: [54.7795, 32.0550], type: 'Столкновение', severity: 'medium', description: 'Столкновение на перекрестке', time: '10 часов назад', address: 'пл. Ленина' },
    { id: 10, coordinates: [54.7870, 32.0420], type: 'Наезд', severity: 'low', description: 'Наезд на бордюр', time: '12 часов назад', address: 'ул. Тухачевского, 7' },
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
    map = new mapgl.Map('map', {
        center: SMOLENSK_CENTER,
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
    document.getElementById('zoom-in').addEventListener('click', () => {
        map.setZoom(map.getZoom() + 1);
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
        map.setZoom(map.getZoom() - 1);
    });

    document.getElementById('current-location').addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    map.setCenter([position.coords.latitude, position.coords.longitude]);
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

    document.getElementById('reset-view').addEventListener('click', () => {
        map.setCenter(SMOLENSK_CENTER);
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
}

// Добавление маркеров на карту
function addMarkersToMap() {
    // Очищаем существующие маркеры
    clearMarkers();

    // Фильтруем данные в зависимости от выбранного фильтра
    const filteredData = filterAccidentsData(accidentsData, currentFilter);

    filteredData.forEach(accident => {
        // Создаем HTML для маркера
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
                font-size: 14px;
            ">
                <i class="fas fa-${getIncidentIcon(accident.type)}"></i>
            </div>
        `;

        const marker = new mapgl.Marker(map, {
            coordinates: accident.coordinates,
            element: markerElement
        });

        markers.push({ marker, data: accident });

        // Добавляем popup при клике на маркер
        markerElement.addEventListener('click', () => {
            if (popup) {
                popup.destroy();
            }

            popup = new mapgl.Popup(map, {
                coordinates: accident.coordinates,
                offset: [0, -35],
                content: createPopupContent(accident)
            });

            // Закрытие popup при следующем клике
            setTimeout(() => {
                markerElement.addEventListener('click', () => {
                    if (popup) {
                        popup.destroy();
                        popup = null;
                    }
                }, { once: true });
            }, 100);
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
    markers.forEach(({ marker }) => marker.destroy());
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
                const lat = acc.coordinates[0];
                const lng = acc.coordinates[1];
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
            map.setCenter(accident.coordinates);
            map.setZoom(16);

            // Показываем popup при клике на элемент списка
            if (popup) {
                popup.destroy();
            }

            popup = new mapgl.Popup(map, {
                coordinates: accident.coordinates,
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

    document.getElementById('total-accidents').textContent = filteredData.length;
    document.getElementById('today-accidents').textContent = accidentsData.filter(acc =>
        acc.time.includes('минут') || acc.time.includes('час')).length;
    document.getElementById('serious-accidents').textContent = accidentsData.filter(acc =>
        acc.severity === 'high').length;
}

// Обновление времени последнего обновления
function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('update-time').textContent = timeString;
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