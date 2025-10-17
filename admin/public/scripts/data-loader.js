class DataLoader {
    constructor() {
        this.detectors = [];
        this.vehicles = [];
        this.roadGraph = null;
    }

    async loadData(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Ошибка загрузки: ${response.status}`);
            }

            const data = await response.json();
            this.detectors = data.detectors || [];

            // Парсим данные под наш формат
            this.parseDetectors();

            return {
                detectors: this.detectors,
                vehicles: this.vehicles,
                totalRecords: this.detectors.length,
                uniqueVehicles: this.vehicles.length
            };

        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            throw error;
        }
    }

    parseDetectors() {
        // Группируем по ТС и сортируем по времени
        const vehiclesMap = {};

        this.detectors.forEach(detector => {
            const vehicleId = detector.Идентификатор_ТС || detector.vehicle_id;

            if (!vehiclesMap[vehicleId]) {
                vehiclesMap[vehicleId] = {
                    vehicle_id: vehicleId,
                    route: []
                };
            }

            vehiclesMap[vehicleId].route.push({
                detector_id: detector.ID_детектора || detector.detector_id,
                timestamp: new Date(detector.Временная_метка || detector.timestamp),
                speed: (() => {
                    const v = detector.Скорость_прохождения ?? detector.speed ?? '0';
                    const n = Number(String(v).replace(',', '.'));
                    return Number.isFinite(n) ? n : 0;
                })(),
                lat: detector.lat,
                lon: detector.lon
            });
        });

        // Сортируем по времени и фильтруем ТС с минимум 2 точками
        this.vehicles = Object.values(vehiclesMap)
            .filter(vehicle => vehicle.route.length >= 2)
            .map(vehicle => {
                vehicle.route.sort((a, b) => a.timestamp - b.timestamp);
                return vehicle;
            });
    }

    getVehicleById(vehicleId) {
        return this.vehicles.find(v => v.vehicle_id === vehicleId);
    }

    getAllVehicles() {
        return this.vehicles;
    }

    getDetectors() {
        return this.detectors;
    }
}

// Создаем глобальный экземпляр
window.dataLoader = new DataLoader();