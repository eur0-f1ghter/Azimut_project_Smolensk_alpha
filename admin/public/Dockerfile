FROM nginx:latest
LABEL authors="Azimut Team"
WORKDIR /usr/share/nginx/html
RUN mkdir -p /usr/share/nginx/html/style .
COPY index.html .
COPY style/style.css . /usr/share/nginx/html/style/