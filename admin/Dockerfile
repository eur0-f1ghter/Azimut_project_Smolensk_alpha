FROM node:18-alpine
LABEL authors="Azimut Team"
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production
RUN mkdir -p /usr/src/app/admin .
RUN mkdir -p /usr/src/app/admin/public .
RUN mkdir -p /usr/src/app/admin/public/scripts .
RUN mkdir -p /usr/src/app/admin/public/style .
COPY admin/server.js . /usr/src/app/admin/
COPY admin/public/scripts/app.js .  /usr/src/app/admin/public/scripts/
COPY admin/public/scripts/convoyAnalyzer.js . /usr/src/app/admin/public/scripts/
COPY admin/public/scripts/data-loader.js . /usr/src/app/admin/public/scripts/
COPY admin/public/scripts/routeBuilder.js . /usr/src/app/admin/public/scripts/
COPY admin/public/scripts/loadAnalysis.js . /usr/src/app/admin/public/scripts/
COPY admin/public/scripts/map.js . /usr/src/app/admin/public/scripts/
COPY admin/public/scripts/popularRoutesAnalyzer.js . /usr/src/app/admin/public/scripts/
COPY admin/public/scripts/route-visualizer.js . /usr/src/app/admin/public/scripts/
COPY admin/public/style/style.css . /usr/src/app/admin/public/style/
COPY admin/public/admin.html . /usr/src/app/admin/public/

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "admin/server.js"]
