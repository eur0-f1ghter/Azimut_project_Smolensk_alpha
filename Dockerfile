FROM nginx:latest
LABEL authors="Azimut Team"
WORKDIR /usr/share/nginx/html
COPY index.html .
COPY about.html .
COPY crew.html .
COPY documents.html .
COPY map.html .
COPY news.html .
COPY chart.js .
COPY preloader.js .
COPY map.js .
RUN mkdir -p /usr/share/nginx/html/css .
RUN mkdir -p /usr/share/nginx/html/image .
RUN mkdir -p /usr/share/nginx/html/documents .
COPY css/style.css . /usr/share/nginx/html/css/
COPY documents/1_1_rasporyazhenie-o-reorganizatsii-2.pdf . /usr/share/nginx/html/documents/
COPY documents/1_ustav-1.pdf . /usr/share/nginx/html/documents/
COPY documents/2_ИНН_ЦОДД.pdf . /usr/share/nginx/html/documents/
COPY documents/3_ОГРН_Свидетельство-о-регистрации-ЦОДД.pdf . /usr/share/nginx/html/documents/
COPY documents/4_Распоряжение-о-назначении-директора.pdf . /usr/share/nginx/html/documents/
COPY documents/5_Распоряжение-о-внесении-изменений-в-Устав.pdf . /usr/share/nginx/html/documents/
COPY documents/Law-1.pdf . /usr/share/nginx/html/documents/
COPY documents/Memo-2.pdf . /usr/share/nginx/html/documents/
COPY documents/Положение_об_антикоррупционноиполитике.pdf . /usr/share/nginx/html/documents/
COPY documents/сводная_ведомость_результатов_проведения_специальнои_оценки_условии.pdf . /usr/share/nginx/html/documents/
COPY image/26eade7d7cb74a851da66e655a99d9f3-1.jpg . /usr/share/nginx/html/image/
COPY image/logo-white.png . /usr/share/nginx/html/image/
COPY image/logo_main.png . /usr/share/nginx/html/image/
COPY image/new_logo_main.png . /usr/share/nginx/html/image/
COPY image/smolensk_bus_station.jpg . /usr/share/nginx/html/image/
COPY image/smolensk_transport.jpg . /usr/share/nginx/html/image/
COPY image/VK_Logo.png . /usr/share/nginx/html/image/
