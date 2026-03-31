FROM node:22-slim

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ .

EXPOSE 3000

CMD ["node", "server.js"]