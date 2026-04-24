FROM node:22-slim

WORKDIR /app/backend

RUN apt-get update && \
    apt-get install -y libreoffice --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/lib/libreoffice/program:${PATH}"

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ .

EXPOSE 3000

CMD ["node", "server.js"]