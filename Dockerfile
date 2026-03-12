FROM node:22-slim

# Install Python (slim base = smaller image)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Node deps first (layer caching)
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy Python requirements and install
COPY backend/features/ai-assessment/requirements.txt ./backend/features/ai-assessment/
RUN pip3 install --break-system-packages -r backend/features/ai-assessment/requirements.txt

# Copy rest of backend
COPY backend/ ./backend/

EXPOSE 10000

CMD ["node", "backend/server.js"]