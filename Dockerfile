FROM node:22-slim

# Install Python
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Node dependencies
COPY backend/package*.json ./
RUN npm install --omit=dev

# Python dependencies
COPY backend/features/ai-assessment/requirements.txt ./features/ai-assessment/
RUN pip3 install --no-cache-dir -r features/ai-assessment/requirements.txt

# Copy backend code
COPY backend/ .

# Expose port (match your server.js)
EXPOSE 3000

CMD ["node", "server.js"]
