FROM node:22

# Install Python
RUN apt-get update && apt-get install -y python3 python3-pip

WORKDIR /app

# Copy and install Node deps
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Copy Python requirements and install
COPY backend/features/ai-assessment/requirements.txt ./backend/features/ai-assessment/
RUN pip3 install --break-system-packages -r backend/features/ai-assessment/requirements.txt

# Copy rest of backend
COPY backend/ ./backend/

EXPOSE 3000

CMD ["node", "backend/server.js"]