(function(){
    // Проверим, что глобальные данные есть
    if (typeof accidentsData === 'undefined') {
        console.warn('accidentsData not found — убедись, что map.js загружен до этого скрипта.');
        return;
    }

    // Получение уникальных типов в порядке появления
    function getTypes(data) {
        const set = new Set();
        data.forEach(d => set.add(d.type));
        return Array.from(set);
    }

    // Фильтрация по severity: 'all' | 'high' | 'medium' | 'low'
    function filterBySeverity(data, severity) {
        if (!severity || severity === 'all') return data.slice();
        return data.filter(d => (d.severity || '').toLowerCase() === severity.toLowerCase());
    }

    // Подсчёт по типам: возвращает {labels:[], counts:[]}
    function countsByType(data, types) {
        const counts = types.map(t => 0);
        const index = new Map(types.map((t,i) => [t,i]));
        data.forEach(d => {
            const pos = index.get(d.type);
            if (pos !== undefined) counts[pos] += 1;
        });
        return { labels: types, counts };
    }

    // Обновление верхних цифр (вставляет в элементы с выбранными id)
    function updateTopNumbers(data) {
        const totalEl = document.getElementById('total-accidents');
        const todayEl = document.getElementById('today-accidents');
        const seriousEl = document.getElementById('serious-accidents');

        if (totalEl) totalEl.textContent = data.length;

        // "За сегодня" — по твоей логике в map.js: includes 'минут' or 'час'
        const todayCount = accidentsData.filter(acc =>
            acc.time && (acc.time.includes('минут') || acc.time.includes('час'))
        ).length;
        if (todayEl) todayEl.textContent = todayCount;

        // серьёзные во всём массиве (не считая фильтра severity)
        const seriousCount = accidentsData.filter(acc => acc.severity === 'high').length;
        if (seriousEl) seriousEl.textContent = seriousCount;
    }

    // Создание/инициализация Chart.js
    const ctx = document.getElementById('dashboard-chart').getContext('2d');
    const baseTypes = getTypes(accidentsData);
    const initialCounts = countsByType(accidentsData, baseTypes);

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: initialCounts.labels,
            datasets: [{
                label: 'Кол-во',
                data: initialCounts.counts,
                backgroundColor: initialCounts.labels.map((_,i) => {
                    // подбор цветов по индексу (можно кастомизировать)
                    const palette = ['#2f78b4','#d16a1e','#2fa64a','#c79b2a','#ca2aa6','#6c5ce7','#ff7675'];
                    return palette[i % palette.length];
                })
            }]
        },
        options: {
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: '#ddd' },
                    grid: { display:false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#bbb' },
                    grid: { color: 'rgba(255,255,255,0.03)' }
                }
            },
            maintainAspectRatio: false
        }
    });

    // Обновление графика и чисел при выборе фильтра
    function refreshForSeverity(sev) {
        const filtered = filterBySeverity(accidentsData, sev);
        // ensure same labels order as baseTypes (so bars correspond)
        const { labels, counts } = countsByType(filtered, baseTypes);

        chart.data.labels = labels;
        chart.data.datasets[0].data = counts;
        chart.update();

        // обновим верхние цифры (показывать для выбранного фильтра)
        // Тут показываем totals для текущего фильтра в блоке "Всего происшествий"
        const totalEl = document.getElementById('total-accidents');
        if (totalEl) totalEl.textContent = filtered.length;

        // Обновляем остальные сверху (оставляем их по глобальным данным)
        updateTopNumbers(filtered);
    }

    // Навешиваем обработчики на кнопки фильтра
    document.querySelectorAll('.severity-filter').forEach(btn => {
        btn.addEventListener('click', function(){
            document.querySelectorAll('.severity-filter').forEach(b=>b.classList.remove('active'));
            this.classList.add('active');
            const sev = this.dataset.sev;
            refreshForSeverity(sev);
        });
    });

    // Первичное обновление
    updateTopNumbers(accidentsData);
    // show all by default
    refreshForSeverity('all');
})();