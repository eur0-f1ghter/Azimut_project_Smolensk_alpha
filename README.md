# Smolathon_azimut_226
 Ветка diagrams содержит диаграммы для первого чекпоинта

создание docker образа:
1. Должен уже быть предустановлен Docker Desktop (Linux version брать инструцию с сайта по установке)
2. Команды:

docker build . -t nginx-smolensk

docker run -d -p 8080:80 nginx-smolensks